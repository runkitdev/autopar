const parser = require("./babel-parser-plugin");


module.exports = parser `parallel-branch` (({ types: t }, superclass) =>

class ParallelBranchParser extends superclass
{
    // We want to extend ScopeHandler to understand "parallel" scopes much like
    // "async" scopes. The easiest way to do this is to create a
    // `nextScopeIsParallel` property and override enter() to mark the scope as
    // parallel if it's true. This allows us to avoid having to edit every
    // Function Node creation method to also understand parallel scopes.
    getScopeHandler()
    {
        return class ParallelScopeHandler extends super.getScopeHandler()
        {
            enter(...args)
            {
                super.enter(...args);

                if (this.nextScopeIsParallel)
                    this.currentVarScope().inParallel = true;

                this.nextScopeIsParallel = false;
            }

            inParallel()
            {
                return this.currentVarScope().inParallel
            }
        }
    }

    parseFunction(...args)
    {
        // We *have to* check this first.
        const wasInParallel = this.scope.nextScopeIsParallel;
        const node = super.parseFunction(...args);

        return wasInParallel ? Object.assign(node, { parallel: true }) : node;
    }

    parseStatementContent(context, ...rest)
    {
        // This is basically the same way async functions are detected in
        //
        // https://github.com/babel/babel/blob/master/packages/babel-parser/src/parser/statement.js#L268
        //
        // However, in Babel, this is done at the end if no other token matches.
        // We can get away with checking whether we're at a parallel function
        // *first* because "parallel" shouldn't collide with any other tokens.
        if (!this.isParallelFunction())
            return super.parseStatementContent(context, ...rest);

        if (context)
            this.unexpected(null,
                `Parallel functions can only be declared at the top level or ` +
                `inside a block`);

        // At this point we know we either have a parallel function.
        this.scope.nextScopeIsParallel = true;
        this.next();

        return this.parseFunctionStatement(this.startNode(), false, !context);
    }

    isParallelFunction()
    {
        // We basically want identical behavior to isAsyncFunction, except with
        // the "parallel" identifier:
        //
        // https://github.com/babel/babel/blob/master/packages/babel-parser/src/parser/statement.js#L1756
        //
        // One option would be to copy the contents of the function, and all of its
        // un-exported dependencies, but that would require us tracking it indefinitely.
        // Instead, we just modify the behavior of isContextual to check "parallel"
        // it is asked to check "async". This is the only difference in the function.
        const hasIsContextual = Object.hasOwnProperty("isContextual");
        const trueIsContextual = this.isContextual;
        this.isContextual = word => trueIsContextual
            .call(this, word === "async" ? "parallel" : word);
        const result = this.isAsyncFunction();

        if (hasIsContextual)
            this.isContextual = trueIsContextual;
        else
            delete this.isContextual;

        return result;
    }


    checkReservedWord(word, startLoc, ...rest)// checkKeywords, isBinding)
    {
        if (this.scope.inParallel() && word === "branch")
            this.raise(
                startLoc,
                "Can not use 'branch' as identifier inside a parallel function");

        if (this.scope.inParallel() && word === "branching")
            this.raise(
                startLoc,
                "Can not use 'branching' as identifier inside a parallel function");

        return super.checkReservedWord(word, startLoc, ...rest);
    }

    parseMaybeUnary(...args)
    {
        // To make our lives easier, we parse parallel function *expressions* as
        // if they were the "parallel operator" applied to a function expression.
        if (this.isContextual("parallel"))
        {
            this.scope.nextScopeIsParallel = true;
            this.next();

            return super.parseMaybeUnary(...args);
        }

        if (this.scope.inParallel() && this.isContextual("branch"))
            return this.parseBranchExpression("branch");

        if (this.scope.inParallel() && this.isContextual("branching"))
            return this.parseBranchExpression("branching");

        return super.parseMaybeUnary(...args);
    }

    parseBranchExpression(keyword)
    {
        const node = this.startNode();

        if (this.state.inParameters)
            this.raise(
                node.start,
                `${keyword} is not allowed in parallel function parameters`);

        this.next();

        node.callee = this.createIdentifier(this.startNodeAtNode(node), keyword);
        node.arguments = [this.parseMaybeUnary()];

        return this.finishNode(node, "CallExpression");
    }
});

