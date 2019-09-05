const { Δ, is, string, fail } = require("@algebraic/type");
const { List, Set } = require("@algebraic/collections");

const Node = require("@algebraic/ast");
const parse = require("@algebraic/ast/parse");
const KeyPath = require("@algebraic/ast/key-path");

const t = require("./templates");
const transform = require("./transform");
const generate = node => require("@babel/generator").default(node).code;


module.exports = function differentiate(δ, f, bs)
{
    const fExpression = parse.expression(f + "");
    const { id, params: parameters, body } = fExpression;

    const numberedBindings = parameters
        .map(toMaybeIdentifierBinding);
    const namedBindings = parameters
        .reduce((names, parameter) =>
            names.concat(parameter.bindingNames.keys()),
            Set(string)(id ? [id.name] : []));

    const fromNumberedBinding = index =>
        numberedBindings[index] === false ?
            fail(`Can't take the branching derivative of ${f.name} with respect` +
                `to ${index} because no single parameter was found there.`) :
            numberedBindings[index];
    const fromNamedBinding = name =>
        namedBindings.has(name) ?
            fail(`Can't take the branching derivative of ${f.name} with respect ` +
                `to "${name}" because no parameter was found with that name.`) :
            name;

    const variables = bs
        .map(b =>
            typeof b === "number" ? fromNumberedBinding(b) :
            typeof b === "string" ? fromNamedBinding(b) :
            fail(`Branching derivatives can only be taken with respect to ` +
                `named or indexed parameter`));

    const freeVariables = body.freeVariables;
    const uBody = variables
        .reduce((body, variable) => freeVariables
            .get(variable, List(KeyPath)())
            .reduce(derivate, body),
            body);

    // We don't want this function to have the same name as the original,
    // because then it would shadow a reference to the original function.
    const dfExpression = Δ(fExpression, { id: null, body: uBody });
    const transformed = transform(dfExpression);

	const instantiate = new Function(
	   "δ", ...(id ? [id.name] : []),
	   `return ${generate(transformed)}`);

    return instantiate(δ, f);
}

const derivate = (function ()
{
    const insertBranchOrBranching = (node, keyPath) =>
        KeyPath.updateJust((node, remaining) =>
            is (Node.CallExpression, node) ?
                t.branch(node) :
                KeyPath.update(t.branching, remaining, node),
            -1, keyPath, node);
    const isCallOrApply = name => name === "call" || name === "apply";
    const isDotCallOrApply = (node, remaining) =>
        is (Node.CallExpression, node) &&
        remaining.key === "callee" &&
        is (Node.StaticMemberExpression, node.callee) &&
        remaining.child.key === "object" &&
        isCallOrApply(node.callee.property.name);

    return function derivate(body, keyPath)
    {
        return keyPath.length < 2 ?
            insertBranchOrBranching(body, keyPath) :
            KeyPath.updateJust((node, remaining) =>
                isDotCallOrApply(node, remaining) ?
                    t.branch(node) :
                    insertBranchOrBranching(node, remaining),
                    -2, keyPath, body);
    }
})();

function toMaybeIdentifierBinding(pattern)
{
    if (is (Node.IdentifierPattern, pattern))
        return pattern.name;

    if (is (Node.AssignmentPattern, pattern))
        return toMaybeIdentifierBinding(pattern.left);

    return false;
}
