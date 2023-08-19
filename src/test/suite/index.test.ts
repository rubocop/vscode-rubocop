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

    test('format with custom command `rubocop.formatAutocorrects`', async() => {
      const editor = await auto.createEditor(UNFORMATTED);
      await auto.formatAutocorrects();
      assert.equal(editor.document.getText(), SAFE_FORMATTED);
    });

    test('format with custom command `rubocop.formatAutocorrectsAll`', async() => {
      const editor = await auto.createEditor(UNFORMATTED);
      await auto.formatAutocorrectsAll();
      assert.equal(editor.document.getText(), UNSAFE_FORMATTED);
    });
  });
});
