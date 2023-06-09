# vscode-rubocop

Integrates [RuboCop](https://github.com/rubocop/rubocop) into VS Code.

You can install this VS Code extension from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=rubocop.vscode-rubocop).

## Language Server Capabilities

These are the capabilities of this extension, each enabled by RuboCop's [built-in LSP server](https://docs.rubocop.org/rubocop/usage/lsp.html):

| Capability  | Support |
| ------------- | ------------- |
| Diagnostics (Linting) | ✅ |
| Document Formatting  | ✅ |
| Execute Command ([Trigger autocorrect](https://github.com/rubocop/vscode-rubocop#manually-triggering-a-format-with-autocorrects)) | ✅ |
| Everything else  | ❌  |

## Requirements

* [RuboCop](https://rubygems.org/gems/rubocop) 1.53.0+
* [VS Code](https://code.visualst) 1.75.0+

## Configuration

The extension only offers a few of its own configuration options, but because it conforms to
the [VS Code Formatting API](https://code.visualstudio.com/blogs/2016/11/15/formatters-best-practices#_the-formatting-api),
several general editor settings can impact the extension's behavior as well.

## Configuring the VS Code editor to use RuboCop

There are two general editor settings that you'll want to verify are set in
order to use RuboCop as your formatter.

### editor.formatOnSave

To automatically format your Ruby with RuboCop, check **Format on Save** in the
**Formatting** settings under **Text Editor**:

![Format a file on save. A formatter must be available, the file must not be saved after delay, and the editor must not be shutting down.](/docs/format-on-save.png)

Or, in `settings.json`:

```json
"editor.formatOnSave": true,
```

### editor.defaultFormatter

Next, if you have installed multiple extensions that provide formatting for Ruby
files (it's okay if you're not sure—it can be hard to tell), you can specify
RuboCop as your formatter of choice by setting `editor.defaultFormatter` under
a `"[ruby]"` section of `settings.json` like this:

```json
"[ruby]": {
  "editor.defaultFormatter": "rubocop.vscode-rubocop"
},
```

## Configuring RuboCop extension options

To edit RuboCop's own options, first expand **Extensions** and select
**RuboCop** from the sidebar of the Settings editor.

### rubocop.mode

The Mode setting determines how (and whether) RuboCop runs in a given
workspace. Generally, it will try to execute `rubocop` via `bundle exec` if
possible, and fall back on searching for a global `rubocop` bin in your `PATH`.

![Enable RuboCop via the workspace's Gemfile or else fall back on a global installation unless a Gemfile is present and its bundle does not include rubocop](/docs/mode.png)

* _"Always run—whether via Bundler or globally"_ (JSON: `enableUnconditionally`)
  this mode will first attempt to run via Bundler, but if that fails for any
  reason, it will attempt to run `rubocop` in your PATH
* **[Default]** _"Run unless the bundle excludes rubocop"_ (JSON:
  `enableViaGemfileOrMissingGemfile`) this mode will attempt to run RuboCop via
  Bundler, but if a bundle exists and the `rubocop` gem isn't in it (i.e. you're
  working in a project doesn't use RuboCop), the extension will disable itself.
  If, however, no bundle is present in the workspace, it will fall back on the
  first `rubocop` executable in your PATH
* _"Run only via Bundler, never globally"_ (JSON: `enableViaGemfile`) the same as
  the default `enableViaGemfileOrMissingGemfile`, but will never run
  `rubocop` from your PATH (as a result, single-file windows and workspace
  folders without a Gemfile may never activate the extension)
* _"Run only globally, never via Bundler"_ (JSON: `onlyRunGlobally`) if you want
  to avoid running the bundled version of RuboCop, this mode will never
  interact with Bundler and will only run `rubocop` on your PATH
* _"Disable the extension"_ (JSON: `disable`) disable the extension entirely

Or, in `settings.json`:

```json
"rubocop.mode": "enableViaGemfile",
```

### rubocop.autocorrect

The autocorrect option does what it says on the tin. if you don't want RuboCop to
automatically edit your documents on save, you can disable it here:

![Autocorrect](/docs/autocorrect.png)

You might want to disable this if you're using RuboCop to highlight problems
but don't want it to edit your files automatically. You could also accomplish
this by disabling `editor.formatOnSave`, but as that's a global setting across
all languages, it's more straightforward to uncheck this extension setting.

Or, in `settings.json`:

```json
"rubocop.autocorrect": true,
```

### rubocop.safeAutocorrect

**This feature requires RuboCop 1.54+ to be enabled.**

When autocorrect is enabled, `safeAutocorrect` controls its safety. By default,
it is enabled to perform safe autocorrections. If you disable it, unsafe
autocorrections will also be performed, you can disable it here:

![SafeAutocorrect](/docs/safe-autocorrect.png)

Or, in `settings.json`:

```json
"rubocop.safeAutocorrect": false,
```

### rubocop.commandPath

As described above, the extension contains logic to determine which version of
`rubocop` to launch. If you want a specific binary to run instead, you can
set it here.

![Command Path](/docs/command-path.png)

This will override whatever search strategy is set in `rubocop.mode`
(except for `disable`, in which case the extension will remain disabled).

Or, in `settings.json`:

```json
{
  "rubocop.commandPath": "${userHome}/.rbenv/shims/rubocop"
}
```

### rubocop.yjitEnabled

This extension supports YJIT, which can speed up the built-in language server in RuboCop.
The `rubocop.yjitEnabled` option is enabled by default.

![YJIT Enabled](/docs/yjit-enabled.png)

You can disable YJIT by unchecking.

Or, in `settings.json`:

```json
"rubocop.yjitEnabled": false
```

### Changing settings only for a specific project

You may want to apply certain settings to a specific project, which you can do
by configuring them in the [Workspace scope](https://code.visualstudio.com/docs/getstarted/settings#_workspace-settings)
as opposed to the global User scope.

![Workspace scope](/docs/workspace.png)

Clicking "Workspace" before changing a setting will save it to
`.vscode/settings.json` inside the root workspace directory and will not affect
the extension's behavior in other workspace folders.

## Manually triggering a format with autocorrects

In addition to the built-in VS Code Formatting API, you can trigger the
extension to format and autocorrect the current file listing by running
the command "RuboCop: Format with Autocorrects":

![Autocorrect command](/docs/autocorrect-command.png)

This is handy if you don't want to enable format-on-save, already have another
formatter associated with Ruby files, want to format your code _before_ saving,
or just want to bind a shortcut to RuboCop's formatting action.

To map a keybind to the command, search for it by name in the [Keyboard Shortcuts
editor](https://code.visualstudio.com/docs/getstarted/keybindings#_keyboard-shortcuts-editor):

![Keybinding](/docs/keybind.png)

Or, in `keybindings.json`:

```json
[
  {
    "key": "ctrl+alt+cmd+f",
    "command": "rubocop.formatAutocorrects"
  }
]
```

## Decoding the Status Bar item

The extension also includes a status bar item to convey the status of the
current file listing at a glance.

When the file conforms to RuboCop without issue:

![Status: no issues](/docs/status-ok.png)

When the file contains a low-severity formatting issue:

![Status: info](/docs/status-info.png)

When the file contains a normal linter error:

![Status: info](/docs/status-warn.png)

When the file fails to parse at all:

![Status: parse failure](/docs/status-parse-fail.png)

Clicking the status bar item will open the problems tab:

![Problems tab](/docs/problems.png)

## Limitations

There's some room for improvement yet, but it isn't yet clear whether these
limitations will be a big deal in practice:

* The extension will only launch a single instance of `rubocop --lsp` per
  workspace. If you're using a [multi-root workspace](https://code.visualstudio.com/docs/editor/multi-root-workspaces),
  they'll all be handled by whatever RuboCop version is found in the first one
* RuboCop's LSP only supports "Full" [text document synchronization](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_synchronization),
  both because it seemed hard to implement incremental sync correctly and
  because attempting to pass RuboCop's runner a partial document would result in
  inconsistent formatting results

## Acknowledgements

This extension's codebase was initially based on [Standard Ruby](https://github.com/standardrb)'s
[vscode-standard-ruby](https://github.com/standardrb/vscode-standard-ruby) and
[Kevin Newton](https://github.com/kddnewton)'s [vscode-syntax-tree](https://github.com/ruby-syntax-tree/vscode-syntax-tree)
extension, which has a similar architecture (VS Code language client
communicating with a long-running Ruby process via STDIO). Thank you!

## Code of Conduct

This project follows The RuboCop Community [Code of Conduct](https://github.com/rubocop/rubocop/blob/master/CODE_OF_CONDUCT.md).
