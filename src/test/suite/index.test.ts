import * as assert from 'assert';
import { before, beforeEach } from 'mocha';
import { State } from 'vscode-languageclient';

import * as auto from './automation';
import * as extension from '../../extension';

const UNFORMATTED = `class Foo
  def bar
    puts "baz"
  end
end
`;

const SAFE_FORMATTED = `class Foo
  def bar
    puts 'baz'
  end
end
`;

const UPDATED_SAFE_FORMATTED = `# Updated in the editor
${SAFE_FORMATTED}`;

const UNSAFE_FORMATTED = `# frozen_string_literal: true

class Foo
  def bar
    puts 'baz'
  end
end
`;

suite('RuboCop', () => {
  beforeEach(auto.reset);

  suite('lifecycle commands', () => {
    test('start', async() => {
      await auto.start();
      assert.notEqual(extension.languageClient, null);
      assert.equal(extension.languageClient?.state, State.Running);
    });

    test('stop', async() => {
      await auto.start();
      await auto.stop();
      assert.equal(extension.languageClient, null);
    });

    test('restart', async() => {
      await auto.restart();
      assert.notEqual(extension.languageClient, null);
      assert.equal(extension.languageClient?.state, State.Running);
    });
  });

  suite('functional commands', () => {
    before(auto.reset);

    test('format', async() => {
      const editor = await auto.createEditor(UNFORMATTED);
      await auto.formatDocument();
      assert.equal(editor.document.getText(), SAFE_FORMATTED);
    });

    test('format with custom command `rubocop.formatAutocorrectsCurrentDocument`', async() => {
      const editor = await auto.createEditor(UNFORMATTED);
      const initialVersion = editor.document.version;
      const edited = await editor.edit(editBuilder => {
        editBuilder.insert(editor.document.positionAt(0), '# Updated in the editor\n');
      });

      assert.ok(edited);
      assert.ok(editor.document.version > initialVersion);
      await auto.formatAutocorrects();
      assert.equal(editor.document.getText(), UPDATED_SAFE_FORMATTED);
    });

    test('format with custom command `rubocop.formatAutocorrectsAllCurrentDocument`', async() => {
      const editor = await auto.createEditor(UNFORMATTED);
      await auto.formatAutocorrectsAll();
      assert.equal(editor.document.getText(), UNSAFE_FORMATTED);
    });
  });
});
