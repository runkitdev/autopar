const differentiate = require("parallel-branch/differentiate");
const fromBabel = require("@algebraic/ast/from-babel");
const toBabel = require("@algebraic/ast/to-babel");
const insertDeclaration = Symbol("insertDeclaration");
const parserPlugin = require("./parser-plugin");

const { parseExpression } = require("@babel/parser");
const toParallel = (callee => fExpression =>
    ({ type: "CallExpression", callee, arguments:[fExpression] }))
    (parseExpression("δ.parallel"));


module.exports = function plugin(babel)
{
    // This has to be let in order for it to take place before all the function
    // declarations.
    const scope =
        (({ left: id, right: init }) => ({ kind:"let", id, init }))
        (parseExpression(`δ = require("parallel-branch/δ")`));

    const Program = path => void(path.hub.file[insertDeclaration] = () =>
        (path.scope.push(scope), delete path.hub.file[insertDeclaration]));

    return  {
                name: "@parallel/branch",

                manipulateOptions: (opts, parserOpts) =>
                    parserOpts.plugins.push(parserPlugin(babel)),

                visitor: { Program, Function: { exit: FunctionExit } }
            };
}

function FunctionExit(path, { file })
{
    const functionNode = path.node;

    if (file[insertDeclaration])
        file[insertDeclaration]();

    if (functionNode.parallel)
    {
        const algebraic = fromBabel(functionNode);
        const parallel = differentiate(algebraic);

        // Even though we took extra care to make sure that algebraic/ast is
        // backwards-compatible with Babel, replaceWith wants to do silly
        // things like *mutate* the node we just handed it. So let's just give
        // it a plain object.
        const babelNode = toBabel(parallel);

        if (functionNode.type === "FunctionDeclaration")
        {
            const functionExpression =
                toParallel({ ...babelNode, type: "FunctionExpression" });

            path.remove();
            path.scope.push({ id: parallel.id, kind:"let", init: functionExpression });
        }
        else
            path.replaceWith(toParallel(babelNode));
    }
};
