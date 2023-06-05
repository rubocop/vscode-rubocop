To cut a release of the extension, you must login with vsce using the project's
[personal access
token](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token):

```console
$ yarn vsce login rubocop
```

Next, you should just need to run:

```console
$ yarn run vsce:publish
```
