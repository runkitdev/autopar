const plugin = require("@parallel-branch/babel-plugin");
const transform = require("@babel/core").transform;
const log_and_val = x => (console.log(x), eval(x));
const run = require("@parallel-branch/task/run");
const take_time = () => Promise.resolve(7);
const throw_it = x => Promise.reject(x);
const delay = timeout => new Promise(resolve => setTimeout(timeout, resolve));

log_and_val(transform(`
const { List, Set, OrderedSet, Stack, Seq } = require("@algebraic/collections");
const {any} = require("@algebraic/type");
function id(x)
{
    return x;
}
/*
parallel function m()
{
    return [0,0,0].map(branching id);
}*/

parallel function fib(x)
{
    if (x <= 1)
        return 1;

    return branch fib(x - 1) + branch fib(x - 2);
}

parallel function many_fib()
{
    return [0,1,2,3,4,5,6,7,8,9].map(branching fib);
}

parallel function recurse(m, x)
{
    return (branch m(x) === 0) ? branch (() => "yes")() : (branch recurse(m, x - 1));
}

(async function ()
{
    try {
//        console.log(await m());
//        console.log(await recurse(id, 2));
        console.log(await many_fib());
    }
    catch (e) { console.log("GOT: ", e); }
})();

`, { plugins: [plugin]/*, generatorOpts: { concise:true }*/ }).code);

/*
                console.log("ERRORS: " + errors);
                
                return 8;

*/

/*

parallel function simple()
{
    const x = 1 + 2;
    const y = 3 + 5;
    const z = x + y;

    return z + 7;
}

parallel function sum(x)
{
    if (x <= 0)
        return 0;

    return x + branch sum(x - 1);
}

parallel function fib(x)
{
    if (x <= 1)
        return 1;

    return branch fib(x - 1) + branch fib(x - 2);
}

parallel function time_taker()
{
    return branch take_time() + branch take_time();
}

parallel function two_exceptions()
{
    return branch throw_it(1) + branch throw_it(2);
}

parallel function one_exception()
{
    return branch throw_it(1);
}

parallel function call_one_exception()
{
    return branch one_exception();
}

parallel function call_two_exceptions()
{
    return branch two_exceptions();
}

parallel function simpler()
{
    return branch simple() + branch simple();//take_time() + branch take_time();
}

parallel function d(one, two)
{
    const a = (console.log("hi!"),10);
    return branch take_time(a) + branch take_time(a);/*
    const x = 1 + 2
    const y = 3 + 5;
    const z = x + y;

    return z + 7;/*
    
    
    const start = 10 + 1;

    if (branch x())
        return 5;

	const a = branch one() + branch two();
	const b = branch o();
	const { c, d } = branch b(a);

	return a + branch h() + c;*//*
}

//console.log(d().nodes.get(0).action+"");
//console.log(d());
//console.log(run(d()));

//console.log(sum(10));
//console.log(run(sum(10)));
//console.log(run(time_taker(10)));
//console.log(simple());
//console.log(run(simple()));
//console.log(run(sum(10)));

//console.log(run(simple(10)));
//console.log(run(simpler()));
/*(async function ()
{
    console.log(await time_taker());
})();

(async function ()
{
    try { await call_one_exception(); console.log("here?"); }
    catch (e) { console.log("GOT: " + e); }
})();
(async function ()
{
    try { console.log("RESULT: " + (await fib(14))); }
    catch (e) { console.log("GOT: " + e); }
})();

parallel function a()
{
    try
    {
        throw Error("hi!");
    }
    catch (errors)
    {
        console.log("IN HERE WITH " + errors);
    }
}

parallel function b(x)
{
    return x < 1 ? x : branch b(x - 1);
}

parallel function c(x)
{
    return x || branch b(x - 1);
}

parallel function call(f, x)
{
    return branch f(x);
}
*/