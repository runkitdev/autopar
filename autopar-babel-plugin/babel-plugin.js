const differentiate = require("autopar/differentiate");
const fromBabel = require("@algebraic/ast/from-babel");
const toBabel = require("@algebraic/ast/to-babel");
const insertDeclaration = Symbol("insertDeclaration");

require("./parser-plugin");

module.exports = function plugin({ types: t })
{
    const { parseExpression } = require("@babel/parser");
    const scope =
        (({ left: id, right: init }) => ({ id, init }))
        (parseExpression(`δ = require("autopar/δ")`));

    const Program = path => void(path.hub.file[insertDeclaration] = () =>
        (path.scope.push(scope), delete path.hub.file[insertDeclaration]));
    
    return  {
                name: "@cause/task/transform",

                manipulateOptions: (opts, parserOpts) =>
                    parserOpts.plugins.push("autopar"),

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
            const functionExpression = { ...babelNode, type: "FunctionExpression" };

            path.remove();
            path.scope.push({ id: parallel.id, kind:"let", init: functionExpression });
        }
        else
            path.replaceWith(babelNode);
    }
};
