// The module "vscode" contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

const vscode = require("vscode");
const Asir_MODE = {
	scheme: "file", 
	language: "Asir"
};
const languageclient = require("vscode-languageclient/node");

let client;

// use LSP
const lsp = require("./Asir");

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log("Congratulations, your extension 'asir-syntax-highlight' is now active!");

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand("asir-syntax-highlight.helloWorld", function () {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage("Hello World from Asir Syntax Highlight!");
	});

	context.subscriptions.push(disposable);

	// hover provider
	context.subscriptions.push(vscode.languages.registerHoverProvider(Asir_MODE, new AsirHoverProvider()));

	// definition provider
	context.subscriptions.push(vscode.languages.registerDefinitionProvider(Asir_MODE, new AsirDefinitionProvider()));

	// completion item provider
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(Asir_MODE, new AsirCompletionItemProvider(), "."));

	// language server
	try {
		const serverOptions = {
			command: "node",
			args: [
				context.extensionPath + "/Asir.js",
				"--language-server"
			]
		};
		const clientOptions = {
			documentSelector: [
				{
					scheme: "file",
					language: "Asir",
				}
			],
		};
		client = new languageclient.LanguageClient("asir-syntax-highlight", serverOptions, clientOptions);
		context.subscriptions.push(client.start());
	} catch (e) {
		vscode.window.showErrorMessage("asir-syntax-highlight couldn't be started.");
	}
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}

// hover provider
class AsirHoverProvider {
	provideHover(document, position, token) {
		let wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z0-9_]+/);
		if (wordRange === undefined) return Promise.reject("no word here");

		let currentWord = document.lineAt(position.line).text.slice(wordRange.start.character, wordRange.end.character);
		return Promise.resolve(new vscode.Hover(currentWord));
	}
}

// definition provider
class AsirDefinitionProvider {
	provideDefinition(document, position, token) {
		const wordRange = document.getWordRangeAtPosition(position,/[a-zA-Z0-9_]+/);
		if (!wordRange) return Promise.reject("No word here.");

		const uri = vscode.Uri.file(document.fileName);
		const ast = lsp.findAstOfPosition(uri, position);
		
		if (ast === null) {
			return Promise.reject("No definition found");
		}	else {
			const pos = new vscode.Position(ast.range.start.line, ast.range.start.character);
			const loc = new vscode.Location(uri, pos);
			return Promise.resolve(loc);
		}
	}
}

// completion item provider
class AsirCompletionItemProvider {
	provideCompletionItems(document, position, token) {
		const uri = vscode.Uri.file(document.fileName);
		const CompletionItems = lsp.completion(uri);

		let completionList = new vscode.CompletionList(CompletionItems, false);
		return Promise.resolve(completionList);
	}
}