import { exec } from 'child_process';
import { homedir } from 'os';
import * as path from 'path';
import { satisfies } from 'semver';
import {
  Diagnostic,
  DiagnosticSeverity,
  ExtensionContext,
  OutputChannel,
  commands,
  window,
  workspace,
  ProviderResult,
  TextEdit,
  TextEditor,
  ThemeColor,
  StatusBarAlignment,
  StatusBarItem
} from 'vscode';
import {
  DidOpenTextDocumentNotification,
  Disposable,
  Executable,
  ExecutableOptions,
  ExecuteCommandRequest,
  LanguageClient,
  LanguageClientOptions,
  RevealOutputChannelOn
} from 'vscode-languageclient/node';

class ExecError extends Error {
  command: string;
  options: object;
  code: number | undefined;
  stdout: string;
  stderr: string;

  constructor(message: string, command: string, options: object, code: number | undefined, stdout: string, stderr: string) {
    super(message);
    this.command = command;
    this.options = options;
    this.code = code;
    this.stdout = stdout;
    this.stderr = stderr;
  }

  log(): void {
    log(`Command \`${this.command}\` failed with exit code ${this.code ?? '?'} (exec options: ${JSON.stringify(this.options)})`);
    if (this.stdout.length > 0) {
      log(`stdout:\n${this.stdout}`);
    }
    if (this.stderr.length > 0) {
      log(`stderr:\n${this.stderr}`);
    }
  }
}

const promiseExec = async function(command: string, options = { cwd: getCwd() }): Promise<{ stdout: string, stderr: string }> {
  return await new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      stdout = stdout.toString().trim();
      stderr = stderr.toString().trim();
      if (error != null) {
        reject(new ExecError(error.message, command, options, error.code, stdout, stderr));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
};

export let languageClient: LanguageClient | null = null;
let outputChannel: OutputChannel | undefined;
let statusBarItem: StatusBarItem | undefined;
let diagnosticCache: Map<string, Diagnostic[]> = new Map();

function getCwd(): string {
  return workspace.workspaceFolders?.[0]?.uri?.fsPath ?? process.cwd();
}

function log(s: string): void {
  outputChannel?.appendLine(`[client] ${s}`);
}

function getConfig<T>(key: string): T | undefined {
  return workspace.getConfiguration('rubocop').get<T>(key);
}

function supportedLanguage(languageId: string): boolean {
  return languageId === 'ruby' || languageId === 'gemfile';
}

function registerCommands(): Disposable[] {
  return [
    commands.registerCommand('rubocop.start', startLanguageServer),
    commands.registerCommand('rubocop.stop', stopLanguageServer),
    commands.registerCommand('rubocop.restart', restartLanguageServer),
    commands.registerCommand('rubocop.showOutputChannel', () => outputChannel?.show()),
    commands.registerCommand('rubocop.formatAutocorrects', formatAutocorrects),
    commands.registerCommand('rubocop.formatAutocorrectsAll', formatAutocorrectsAll)
  ];
}

function registerWorkspaceListeners(): Disposable[] {
  return [
    workspace.onDidChangeConfiguration(async event => {
      if (event.affectsConfiguration('rubocop')) {
        await restartLanguageServer();
      }
    })
  ];
}

export enum BundleStatus {
  valid = 0,
  missing = 1,
  errored = 2
}

export enum RuboCopBundleStatus {
  included = 0,
  excluded = 1,
  errored = 2
}

async function displayBundlerError(e: ExecError): Promise<void> {
  e.log();
  log('Failed to invoke Bundler in the current workspace. After resolving the issue, run the command `RuboCop: Start Language Server`');
  if (getConfig<string>('mode') !== 'enableUnconditionally') {
    await displayError('Failed to run Bundler while initializing RuboCop', ['Show Output']);
  }
}

async function isValidBundlerProject(): Promise<BundleStatus> {
  try {
    await promiseExec('bundle list --name-only', { cwd: getCwd() });
    return BundleStatus.valid;
  } catch (e) {
    if (!(e instanceof ExecError)) return BundleStatus.errored;

    if (e.stderr.startsWith('Could not locate Gemfile')) {
      log('No Gemfile found in the current workspace');
      return BundleStatus.missing;
    } else {
      await displayBundlerError(e);
      return BundleStatus.errored;
    }
  }
}

async function isInBundle(): Promise<RuboCopBundleStatus> {
  try {
    await promiseExec('bundle show rubocop', { cwd: getCwd() });
    return RuboCopBundleStatus.included;
  } catch (e) {
    if (!(e instanceof ExecError)) return RuboCopBundleStatus.errored;

    if (e.stderr.startsWith('Could not locate Gemfile') || e.stderr === 'Could not find gem \'rubocop\'.') {
      return RuboCopBundleStatus.excluded;
    } else {
      await displayBundlerError(e);
      return RuboCopBundleStatus.errored;
    }
  }
}

async function shouldEnableIfBundleIncludesRuboCop(): Promise<boolean> {
  const rubocopStatus = await isInBundle();
  if (rubocopStatus === RuboCopBundleStatus.excluded) {
    log('Disabling RuboCop extension, because rubocop isn\'t included in the bundle');
  }
  return rubocopStatus === RuboCopBundleStatus.included;
}

async function shouldEnableExtension(): Promise<boolean> {
  let bundleStatus;
  switch (getConfig<string>('mode')) {
    case 'enableUnconditionally':
      return true;
    case 'enableViaGemfileOrMissingGemfile':
      bundleStatus = await isValidBundlerProject();
      if (bundleStatus === BundleStatus.valid) {
        return await shouldEnableIfBundleIncludesRuboCop();
      } else {
        return bundleStatus === BundleStatus.missing;
      }
    case 'enableViaGemfile':
      return await shouldEnableIfBundleIncludesRuboCop();
    case 'onlyRunGlobally':
      return true;
    case 'disable':
      return false;
    default:
      log('Invalid value for rubocop.mode');
      return false;
  }
}

function hasCustomizedCommandPath(): boolean {
  const customCommandPath = getConfig<string>('commandPath');
  return customCommandPath != null && customCommandPath.length > 0;
}

const variablePattern = /\$\{([^}]*)\}/;
function resolveCommandPath(): string {
  let customCommandPath = getConfig<string>('commandPath') ?? '';

  for (let match = variablePattern.exec(customCommandPath); match != null; match = variablePattern.exec(customCommandPath)) {
    switch (match[1]) {
      case 'cwd':
        customCommandPath = customCommandPath.replace(match[0], process.cwd());
        break;
      case 'pathSeparator':
        customCommandPath = customCommandPath.replace(match[0], path.sep);
        break;
      case 'userHome':
        customCommandPath = customCommandPath.replace(match[0], homedir());
        break;
    }
  }

  return customCommandPath;
}

async function getCommand(): Promise<string> {
  if (hasCustomizedCommandPath()) {
    return resolveCommandPath();
  } else if (getConfig<string>('mode') !== 'onlyRunGlobally' && await isInBundle() === RuboCopBundleStatus.included) {
    return 'bundle exec rubocop';
  } else {
    return 'rubocop';
  }
}

const requiredGemVersion = '>= 1.53.0';
async function supportedVersionOfRuboCop(command: string): Promise<boolean> {
  try {
    const { stdout } = await promiseExec(`${command} -v`);
    const version = stdout.trim();
    if (satisfies(version, requiredGemVersion)) {
      return true;
    } else {
      log('Disabling because the extension does not support this version of the rubocop gem.');
      log(`  Version reported by \`${command} -v\`: ${version} (${requiredGemVersion} required)`);
      await displayError(`Unsupported RuboCop version: ${version} (${requiredGemVersion} required)`, ['Show Output']);
      return false;
    }
  } catch (e) {
    if (e instanceof ExecError) e.log();
    log('Failed to verify the version of rubocop installed, proceeding anyway...');
    return true;
  }
}

async function buildExecutable(): Promise<Executable | undefined> {
  const command = await getCommand();
  if (command == null) {
    await displayError('Could not find RuboCop executable', ['Show Output', 'View Settings']);
  } else if (await supportedVersionOfRuboCop(command)) {
    const [exe, ...args] = (command).split(' ');
    const env = { ...process.env };
    if (getConfig<boolean>('yjitEnabled') ?? true) {
      env.RUBY_YJIT_ENABLE = "true";
    }
    const options: ExecutableOptions = {
      env: env
    };

    return {
      command: exe,
      args: args.concat('--lsp'),
      options: options
    };
  }
}

function buildLanguageClientOptions(): LanguageClientOptions {
  const documentSelector = [
    { scheme: 'file', language: 'ruby' },
    { scheme: 'file', pattern: '**/Gemfile' }
  ];
  const additionalLanguages = getConfig<string[]>('additionalLanguages') ?? [];
  for (const lang of additionalLanguages) {
    documentSelector.push({ scheme: 'file', language: lang });
  }
  return {
    documentSelector: documentSelector,
    diagnosticCollectionName: 'rubocop',
    initializationFailedHandler: (error) => {
      log(`Language server initialization failed: ${String(error)}`);
      return false;
    },
    initializationOptions: {
      safeAutocorrect: getConfig<boolean>('safeAutocorrect') ?? true,
      lintMode: getConfig<boolean>('lintMode'),
      layoutMode: getConfig<boolean>('layoutMode')
    },
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    outputChannel,
    synchronize: {
      fileEvents: [
        workspace.createFileSystemWatcher('**/.rubocop.yml'),
        workspace.createFileSystemWatcher('**/.rubocop_todo.yml'),
        workspace.createFileSystemWatcher('**/Gemfile.lock')
      ]
    },
    middleware: {
      provideDocumentFormattingEdits: (document, options, token, next): ProviderResult<TextEdit[]> => {
        if (getConfig<boolean>('autocorrect') ?? true) {
          return next(document, options, token);
        }
      },
      handleDiagnostics: (uri, diagnostics, next) => {
        diagnosticCache.set(uri.toString(), diagnostics);
        updateStatusBar();
        next(uri, diagnostics);
      }
    }
  };
}

async function createLanguageClient(): Promise<LanguageClient | null> {
  const run = await buildExecutable();
  if (run != null) {
    log(`Starting language server: ${run.command} ${run.args?.join(' ') ?? ''}`);
    return new LanguageClient('RuboCop', { run, debug: run }, buildLanguageClientOptions());
  } else {
    return null;
  }
}

async function displayError(message: string, actions: string[]): Promise<void> {
  const action = await window.showErrorMessage(message, ...actions);
  switch (action) {
    case 'Restart':
      await restartLanguageServer();
      break;
    case 'Show Output':
      outputChannel?.show();
      break;
    case 'View Settings':
      await commands.executeCommand('workbench.action.openSettings', 'rubocop');
      break;
    default:
      if (action != null) log(`Unknown action: ${action}`);
  }
}

async function syncOpenDocumentsWithLanguageServer(languageClient: LanguageClient): Promise<void> {
  for (const textDocument of workspace.textDocuments) {
    if (supportedLanguage(textDocument.languageId)) {
      await languageClient.sendNotification(
        DidOpenTextDocumentNotification.type,
        languageClient.code2ProtocolConverter.asOpenTextDocumentParams(textDocument)
      );
    }
  }
}

async function handleActiveTextEditorChange(editor: TextEditor | undefined): Promise<void> {
  if (languageClient == null || editor == null) return;

  if (supportedLanguage(editor.document.languageId) && !diagnosticCache.has(editor.document.uri.toString())) {
    await languageClient.sendNotification(
      DidOpenTextDocumentNotification.type,
      languageClient.code2ProtocolConverter.asOpenTextDocumentParams(editor.document)
    );
  }
  updateStatusBar();
}

async function afterStartLanguageServer(languageClient: LanguageClient): Promise<void> {
  diagnosticCache = new Map();
  await syncOpenDocumentsWithLanguageServer(languageClient);
  updateStatusBar();
}

async function startLanguageServer(): Promise<void> {
  if (languageClient != null || !(await shouldEnableExtension())) return;

  try {
    languageClient = await createLanguageClient();
    if (languageClient != null) {
      await languageClient.start();
      await afterStartLanguageServer(languageClient);
    }
  } catch (error) {
    languageClient = null;
    await displayError(
      'Failed to start RuboCop Language Server', ['Restart', 'Show Output']
    );
  }
}

async function stopLanguageServer(): Promise<void> {
  if (languageClient == null) return;

  log('Stopping language server...');
  await languageClient.stop();
  languageClient = null;
}

async function restartLanguageServer(): Promise<void> {
  log('Restarting language server...');
  await stopLanguageServer();
  await startLanguageServer();
}

async function formatAutocorrects(): Promise<void> {
  await executeCommand('rubocop.formatAutocorrects');
}

async function formatAutocorrectsAll(): Promise<void> {
  await executeCommand('rubocop.formatAutocorrectsAll');
}

async function executeCommand(command: string): Promise<void> {
  const editor = window.activeTextEditor;
  if (editor == null || languageClient == null || !supportedLanguage(editor.document.languageId)) return;

  try {
    await languageClient.sendRequest(ExecuteCommandRequest.type, {
      command,
      arguments: [{
        uri: editor.document.uri.toString(),
        version: editor.document.version
      }]
    });
  } catch (e) {
    await displayError(
      'Failed to apply RuboCop corrects to the document.', ['Show Output']
    );
  }
}

function createStatusBarItem(): StatusBarItem {
  const statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 0);
  statusBarItem.command = 'workbench.action.problems.focus';
  return statusBarItem;
}

function updateStatusBar(): void {
  if (statusBarItem == null) return;
  const editor = window.activeTextEditor;

  if (languageClient == null || editor == null || !supportedLanguage(editor.document.languageId)) {
    statusBarItem.hide();
  } else {
    const diagnostics = diagnosticCache.get(editor.document.uri.toString());
    if (diagnostics == null) {
      statusBarItem.tooltip = 'RuboCop';
      statusBarItem.text = 'RuboCop $(ruby)';
      statusBarItem.color = undefined;
      statusBarItem.backgroundColor = undefined;
    } else {
      const errorCount = diagnostics.filter((d) => d.severity === DiagnosticSeverity.Error).length;
      const warningCount = diagnostics.filter((d) => d.severity === DiagnosticSeverity.Warning).length;
      const otherCount = diagnostics.filter((d) =>
        d.severity === DiagnosticSeverity.Information ||
          d.severity === DiagnosticSeverity.Hint
      ).length;
      if (errorCount > 0) {
        statusBarItem.tooltip = `RuboCop: ${errorCount === 1 ? '1 error' : `${errorCount} errors`}`;
        statusBarItem.text = 'RuboCop $(error)';
        statusBarItem.backgroundColor = new ThemeColor('statusBarItem.errorBackground');
      } else if (warningCount > 0) {
        statusBarItem.tooltip = `RuboCop: ${warningCount === 1 ? '1 warning' : `${errorCount} warnings`}`;
        statusBarItem.text = 'RuboCop $(warning)';
        statusBarItem.backgroundColor = new ThemeColor('statusBarItem.warningBackground');
      } else if (otherCount > 0) {
        statusBarItem.tooltip = `RuboCop: ${otherCount === 1 ? '1 hint' : `${otherCount} issues`}`;
        statusBarItem.text = 'RuboCop $(info)';
        statusBarItem.backgroundColor = undefined;
      } else {
        statusBarItem.tooltip = 'RuboCop: No issues!';
        statusBarItem.text = 'RuboCop $(ruby)';
        statusBarItem.backgroundColor = undefined;
      }
    }
    statusBarItem.show();
  }
}

export async function activate(context: ExtensionContext): Promise<void> {
  outputChannel = window.createOutputChannel('RuboCop');
  statusBarItem = createStatusBarItem();
  window.onDidChangeActiveTextEditor(handleActiveTextEditorChange);
  context.subscriptions.push(
    outputChannel,
    statusBarItem,
    ...registerCommands(),
    ...registerWorkspaceListeners()
  );

  await startLanguageServer();
}

export async function deactivate(): Promise<void> {
  await stopLanguageServer();
}
