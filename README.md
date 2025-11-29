<p align="center"><img src="images/logo.gif" alt="QMLSense Logo" width="500px"></p>

<p align="center"><b>QML language support for VS Code</b></p>

<p align="center">
  <a href="https://https://github.com/LordTermor/QMLSense/releases/latest">
    <img src="https://img.shields.io/github/v/release/LordTermor/QMLSense" alt="GitHub Release">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-GPLv3-blue" alt="License">
  </a>
</p>

---

<p align="center">
  <img src="images/screenshot.png" alt="QMLSense in action" width="550">
</p>

## Features

- TextMate grammar for `.qml` and `.qmldir` files
- Semantic-based highlighting
- Smart selection (Ctrl+Alt+Left/Right)
- Go to definition (limited)
- Find references
- Basic autocompletion

### Module Index

QMLSense provides an SQLite-based module index for multi-file references and definitions. It works only with qmldir modules, i.e. no CMake or C++-based components support at the moment.

## Installation

Use a .vsix file from GitHub release. VSCode Marketplace is coming soon.

## Known Issues

- Cross-file navigation is limited to qmldir modules
- Autocompletion is very basic

## Contributing

Any help (bug reporting or PRs) is very welcome!

To build an extension, use `build.sh` script. You'll need Docker, [bun](https://bun.com/) or other nodejs package manager - for the later you'll have to update the script.
```sh
$ ./build.py
```

This measure is needed to ensure sqlite uses supported glibc version.

To have project set up just use
```sh
$ bun --bun install
$ bun --bun run compile
```

You can use `F5` in Visual Studio Code to debug the extension.

## License

The software is licensed under GPLv3.