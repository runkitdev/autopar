const { readFileSync } = require("fs");

require.extensions[".parallel-branch.js"] = function (module, filename)
{console.log("INSIDE FOR " + filename);
    const plugin = require("@parallel-branch/babel-plugin");
    const transform = require("@babel/core").transform;
    const contents = readFileSync(filename, "utf8");
    const transformed = transform(contents, { plugins: [plugin] }).code;

    module._compile(transformed, filename);
}
