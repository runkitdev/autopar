const { data, number, string } = require("@algebraic/type");
const { spawn: spawnAsync } = require("child_process");
const { Readable } = require("stream");
const { hasOwnProperty } = Object;

const Result = data `spawn.Result` (
    stdout      => string,
    exitCode    => number );

const ExitCodeError = data `spawn.ExitCodeError` (
    exitCode    => number,
    stderr      => string,
    stack       => string );

module.exports = function spawn(command, args = [], options = { })
{
    return new Promise(function (resolve, reject)
    {
        const stdio = options.stdio || [];
        const hasReadableStdInStream = stdio[0] instanceof Readable;
        const modifiedOptions = hasReadableStdInStream ?
            { ...options, stdio: ["pipe", ...stdio.slice(1)] } :
            options;
        const throwOnExitCode =
            hasOwnProperty.call(options, "throwOnExitCode") ?
            !!options.throwOnExitCode : true;

        const process = spawnAsync(command, args, modifiedOptions);

        if (hasReadableStdInStream)
            stdio[0].pipe(process.stdin);

        const output = { stdout: "", stderr: "" };
        const stack = Error().stack;

        process.on("error", error => reject(error));
        process.on("exit", exitCode =>
            exitCode !== 0 && throwOnExitCode ?
                reject(ExitCodeError({ ...output, exitCode, stack })) :
                resolve(Result({ ...output, exitCode })));

        process.stdout.on("data", data => (console.log(data+""), output.stdout += data));
        process.stderr.on("data", data => output.stderr += data);
    });
}
