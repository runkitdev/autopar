const { join, normalize } = require("path");

module.exports.join = (...components) => normalize(join(...components));

const fs = require("fs");
const { existsSync } = fs;

module.exports.exists = parallel (path => existsSync(path) && path);

const { mkdir } = fs.promises;

module.exports.mkdir = parallel ((path, options) =>
    (branch mkdir(path, options), path));
module.exports.mkdirp = parallel ((path, options) =>
    (branch mkdir(path, { ...options, recursive: true }), path));

const { copyFile } = fs.promises;

module.exports.copy = parallel ((path, ...rest) =>
    (branch copyFile(path, ...rest), path));

const { writeFile } = fs.promises;

module.exports.write = parallel ((path, ...rest) =>
    (branch writeFile(path, ...rest), path));

const { readFile } = fs.promises;

module.exports.read = parallel ((path, ...rest) =>
    (branch readFile(path, ...rest), path));
