# Change Log: Scalr VSCode Extension

All notable changes to the "Scalr" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.1.0]

### Features

-   **Queue runs from your working directory** ([#66](https://github.com/Scalr/scalr-vscode/issues/66)). Open any `.tf` or `.tofu` file and click the ▶ button in the editor title bar to queue a run against the matching Scalr workspace — no `terraform init` required. The extension detects your git repository and working directory, finds the right workspace automatically, packages only the relevant files, and streams live logs as the run progresses. For CLI-sourced workspaces you can choose between a Plan-only or a Plan & Apply run; for VCS-backed workspaces a speculative plan is always used.

-   **"Other workspace" picker**. When no workspace matches the current repository automatically, you can pick any CLI workspace by environment or by name/ID and still trigger a run from your local files.

-   **Workspace type labels**. Each workspace in the picker is now labelled **VCS**, **Module**, or **CLI** so you can tell at a glance how it is sourced.

-   **Approve and discard runs without leaving VS Code**. Runs that are waiting for confirmation now show an ✓ Approve and an ✕ Discard button directly on the plan sub-item in the Runs view. Approving a run automatically opens the apply log so you can follow the apply in real time.

-   **Cancel in-progress runs**. A cancel button appears on any run that is actively planning or applying.

-   **Visual indicators for runs requiring approval**. A bell icon on the run item (and on the workspace item) signals that a run is waiting for your input, making it easy to spot without opening the Scalr web UI.
  
-   Filter workspaces by VCS repository ([#20](https://github.com/Scalr/scalr-vscode/issues/20)). When a git remote is detected in the current VS Code workspace, selecting "By current repository" applies the filter automatically — no manual input needed. Users with multiple remotes get a picker; the option to enter a repository identifier manually is always available.

### Improvements

-   Workspaces and Runs views now refresh automatically every 5 seconds, keeping status current without manual intervention.
-   When a plan step finishes, both views refresh immediately so the approve/discard actions appear without delay.
-   Clicking the Refresh button in the Runs view preserves any active workspace or repository filter.
-   Queuing a run from the working directory automatically focuses and filters both the Workspaces and Runs views to the target workspace.

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

[Unreleased]: https://github.com/Scalr/scalr-vscode/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Scalr/scalr-vscode/compare/v0.0.8...v0.1.0
[0.0.8]: https://github.com/Scalr/scalr-vscode/releases/tag/v0.0.8
[0.0.6]: https://github.com/Scalr/scalr-vscode/releases/tag/v0.0.6
[0.0.5]: https://github.com/Scalr/scalr-vscode/releases/tag/v0.0.5
[0.0.4]: https://github.com/Scalr/scalr-vscode/releases/tag/v0.0.4
[0.0.3]: https://github.com/Scalr/scalr-vscode/releases/tag/v0.0.3
[0.0.2]: https://github.com/Scalr/scalr-vscode/releases/tag/v0.0.2
