# Scalr VS Code Extension

## Overview

The Scalr VS Code Extension is a tool designed to streamline your Opentofu/Terraform workflows by integrating Scalr directly into your Visual Studio Code environment. This extension allows you to manage workspaces, monitor runs, and access critical information about your infrastructure—without leaving your code editor.

![](assets/scalr-extension.png)

## Disclaimer: Early Stages

Please Note: This extension is currently in its early stages of development. While it includes core functionalities, you may encounter bugs or incomplete features. We welcome your feedback and contributions to help improve and stabilize the extension.

## Features

| Feature              | Description                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| Workspace Management | View a comprehensive list of available workspaces for logged-in users.                                       |
| Run Overview         | Access a list of all runs, with the ability to filter runs specific to a workspace.                          |
| Run triggering       | Preview, Apply, or Destroy infrastructure in the selected workspace and review changes right in the VS Code. |
| Detailed Information | Get quick access to general information about any workspace or run.                                          |
| Plan/Apply Output    | Read the output from Terraform plan and apply operations directly within VS Code.                            |
| Scalr UI Integration | Convenient links provide quick navigation to the corresponding sections of the Scalr web UI.                 |

## HTTP PROXY

If the [proxy server](https://code.visualstudio.com/docs/setup/network#_proxy-server-support) is don't used. The proxy for https://scalr.io/ could be configured on vscode by http.proxy and http.proxyAuthorization variables (Settings > User > Applications > Poxy)
or by HTTP_PROXY, HTTPS_PROXY environment variables.

## Installation

### From the VS Code Marketplace

1. Open Visual Studio Code.
2. Navigate to the Extensions view by clicking on the Extensions icon in the Activity Bar on the side of the window.
3. Search for `Scalr` in the search box.
4. Click **Install** to install the extension.

### Building Locally

If you want to install dependencies and build the extension locally, follow these steps:

> ℹ️ **Prerequisites**:
>
> -   **Node.js**: Ensure you have Node.js installed. You can download it from [nodejs.org](https://nodejs.org/).
> -   **npm**: Make sure you have npm (comes with Node.js).

#### Steps to Build Locally

1. **Clone the Repository**:

    ```bash
    git clone https://github.com/{your-username}/scalr-vscode.git
    cd scalr-vscode
    ```

2. **Install Dependencies**:

    ```bash
    npm install
    ```

3. **Run the Extension**:
    - Open the project folder in Visual Studio Code.
    - Press `F5` to open a new VS Code window with your extension loaded.

## Usage

| Command           | How to?                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Login             | After installing, you can log in to your Scalr account through the extension.            |
| View Workspaces   | Click on the Scalr icon in the sidebar to view your available workspaces.                |
| Run Management    | Select a workspace to see all associated runs or access the list of all runs.            |
| Access Details    | Click on a workspace or run to view detailed information, including metadata and status. |
| Plan/Apply Output | Select a run to view the output from Terraform plan and apply operations.                |
| UI Links          | Use the provided links to navigate quickly to the Scalr UI for deeper management tasks.  |

## Contributing

Contributions are welcome! Please follow these steps to contribute:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature-branch-name`).
3. Make your changes.
4. Commit your changes (`git commit -am 'Add new feature'`).
5. Push to the branch (`git push origin feature-branch-name`).
6. Open a pull request in the [scalr-vscode](https://github.com/Scalr/scalr-vscode) repository.

## License

This project is licensed under the MPL-2.0 License. See the [LICENSE](LICENSE) file for details.

## Support

For any issues or feature requests, please open an issue on our [GitHub Issues](https://github.com/Scalr/scalr-vscode/issues) page.
