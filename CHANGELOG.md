# Change Log: Scalr VSCode Extension

All notable changes to the "Scalr" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.0.8]

### Improvements

-   Enhanced workspace provider with improved filtering logic
-   Improved run provider with better filtering and search functionality
-   Added ESLint security plugin for better code security

## [0.0.6]

### Features

-   HTTP proxy support ([#38](https://github.com/Scalr/scalr-vscode/issues/38))
-   Scalr Workspaces & Runs Commands ([#36]https://github.com/Scalr/scalr-vscode/issues/36))

## [0.0.5]

### Features

-   Added support for the web version of the extension ([#23](https://github.com/Scalr/scalr-vscode/issues/23))

## [0.0.4]

### Fixed

-   Add better error handling and reduce api call on create vscode session ([#28](https://github.com/Scalr/scalr-vscode/pull/28/files))

## [0.0.3]

### Features

-   Added the ability to trigger Plan-only, Plan & Apply, and Destroy runs in a workspace. ([#22](https://github.com/Scalr/scalr-vscode/pull/22))

### Improvements

-   Added logs streaming for active runs. ([#22](https://github.com/Scalr/scalr-vscode/pull/22))

## [0.0.2]

-   Updated the Workspaces widget: now users can filter workspaces by environments and perform a search by workspace name or ID. Filters are kept as long as the session is active and applied automatically upon the next launch of VSCode.

## [0.0.1]

### New Features

-   **Workspaces Overview**: Logged-in users can now view a comprehensive list of available workspaces directly within the extension.
-   **Run Overview**: Access a list of all runs, with a filter to display runs specific to a selected workspace.
-   **Workspace/Run Details**: Quickly view general information about any workspace or run, including metadata and status.
-   **Plan/Apply Output**: Easily read the output from Terraform plan and apply operations within the extension.
-   **Scalr UI Integration**: Convenient UI links provide quick navigation to the relevant sections of the Scalr web UI.

---

[Unreleased]: https://github.com/Scalr/scalr-vscode/compare/v0.0.8...HEAD
[0.0.8]: https://github.com/Scalr/scalr-vscode/releases/tag/v0.0.8
[0.0.6]: https://github.com/Scalr/scalr-vscode/releases/tag/v0.0.6
[0.0.5]: https://github.com/Scalr/scalr-vscode/releases/tag/v0.0.5
[0.0.4]: https://github.com/Scalr/scalr-vscode/releases/tag/v0.0.4
[0.0.3]: https://github.com/Scalr/scalr-vscode/releases/tag/v0.0.3
[0.0.2]: https://github.com/Scalr/scalr-vscode/releases/tag/v0.0.2
