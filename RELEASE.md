To cut a release of the extension.

1. Update `version` in package.json and CHANGELOG.md
2. Commit and make sure the CI is green
3. Add a release tag with the git command and push to GitHub

You can published the extension to Visual Studio Marketplace with either A or B below.

## A. Release on web site of Visual Studio Marketplace

Generate vscode-rubocop-x.y.z.vsix using `yarn vsce package` command:

```console
$ yarn vsce package
```

1. Login to Visual Studio Marketplace with RuboCop Headquarters privileges
2. Access to [Manage Publishers & Extensions](https://marketplace.visualstudio.com/manage)
3. Right click on RuboCop and select "update"
4. Upload vscode-rubocop-x.y.z.vsix

## B. Release on terminal

You must login with vsce using the project's
[personal access token](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token):

```console
$ yarn vsce login rubocop
```

Next, you should just need to run:

```console
$ yarn run vsce:publish
```
