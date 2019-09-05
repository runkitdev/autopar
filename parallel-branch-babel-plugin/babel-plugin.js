const transform = require("parallel-branch/transform");
const fromBabel = require("@algebraic/ast/from-babel");
const toBabel = require("@algebraic/ast/to-babel");
const insertDeclaration = Symbol("insertDeclaration");
const parserPlugin = require("./parser-plugin");


module.exports = function plugin(babel)
{
    const { types: t, parse } = babel;
    const parseExpression = code =>
        parse(code).program.body[0].expression;

    const fParallel = parseExpression("δ.parallel");
    const toParallel = fExpression =>
        t.CallExpression(fParallel, [fExpression]);

    // This has to be let in order for it to take place before all the function
    // declarations.
    const scope =
        (({ left: id, right: init }) => ({ kind:"let", id, init }))
        (parseExpression(`δ = require("parallel-branch/δ")`));

    const Program = function (path, state)
    {
        path.hub.file[insertDeclaration] = () =>
            (path.scope.push(scope), delete path.hub.file[insertDeclaration]);
        state.toParallel = toParallel;
    }

    return  {
                name: "@parallel/branch",

                manipulateOptions: (opts, parserOpts) =>
                    parserOpts.plugins.push(parserPlugin(babel)),

                visitor: { Program, Function: { exit: FunctionExit } }
            };
}

function FunctionExit(path, state)
{
    const { file } = state;
    const functionNode = path.node;

    if (file[insertDeclaration])
        file[insertDeclaration]();

    if (functionNode.parallel)
    {
        const algebraic = fromBabel(functionNode);
        const transformed = transform(algebraic);

        // Even though we took extra care to make sure that algebraic/ast is
        // backwards-compatible with Babel, replaceWith wants to do silly
        // things like *mutate* the node we just handed it. So let's just give
        // it a plain object.
        const babelNode = toBabel(transformed);

        if (functionNode.type === "FunctionDeclaration")
        {
            path.remove();
            path.scope.push({ id: functionNode.id, kind:"let", init:babelNode });
        }
        else
            path.replaceWith(babelNode);
    }
};
