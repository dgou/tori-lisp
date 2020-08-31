;(function(exports) {
  var sym = function(token) {
    return "'" + token;
  }

  var _array = function(arr, from) {
    return Array.prototype.slice.call(arr, from || 0);
  };

  var flip = function(fn) {
    return function(first, second) {
      var rest = [].slice.call(arguments, 2)
      return fn.apply(null, [second, first].concat(rest))
    }
  }
  
  var mangle = function(token) {
    if (!isNaN(parseFloat(token))) {
      return parseFloat(token);
    }
    else if (token[0] === '"' && token.slice(-1) === '"') {
      return token.slice(1, -1);
    }
    else if (token == "#t") {
      return true;
    }
    else if (token == "#f") {
      return false;
    }
    else {
      return sym(token);
    }
  }

  var procedure = function(env, params, body) {
    return function() {
      var args = arguments;
      var context = params.reduce(function(ctx, param, index) {
	ctx[param] = args[index];
	return ctx;
      }, {});
      
      context[PARENT_ID] = env;
      return _eval(context, body);
    }
  }
  
  var auto_curry = (function () {
    var curry = function curry(fn /* variadic number of args */) {
      var args = _array(arguments, 1);
      return function curried() {
        return fn.apply(this, args.concat(_array(arguments)));
      };
    };
    
    return function auto_curry(fn, expectedArgs) {
      expectedArgs = expectedArgs || fn.length;
      return function curried() {
        if (arguments.length < expectedArgs) {
          return expectedArgs - arguments.length > 0 ?
            auto_curry(curry.apply(this, [fn].concat(_array(arguments))), expectedArgs - arguments.length) :
            curry.apply(this, [fn].concat(_array(arguments)));
        }
        else if (arguments.length > expectedArgs) {
	  throw new Error("Too many arguments to function: expected " + expectedArgs + ", got " + arguments.length);
	}
	else {
          return fn.apply(this, arguments);
        }
      };
    };   
  }());

  var _first  = function(seq) { return seq[0] };
  var _second = function(seq) { return seq[1] };
  var _rest   = function(seq) { return seq.slice(1) };
  var _head   = function(seq) { return [seq[0]]; };
  var _cons   = auto_curry(function(elem, seq) {
    return [elem].concat(seq);
  }, 2);

  var _plus   = auto_curry(function(l, r) {
    return l + r;
  }, 2);
  
  var part = function(n, array) {
    var i, j;
    var res = [];

    for (i = 0, j = array.length; i < j; i += n) {
      res.push(array.slice(i, i+n));
    }

    return res;
  }

  var garner_bindings = function(env, binds) {
    if (is_seq(env, binds)) {
      return binds;
    }
    else {
      var keys = [];
      for (var key in binds) {
	keys.push(key);
      }
      
      return keys.map(index => binds[index]);
    }
  }

  var doify = function(form) {
    return _cons("'do", form);
  }
  
  var PARENT_ID = "'_PARENT";
  
  var lookup = function(env, id) {
    if (id in env) {
      return env[id];
    } else if (PARENT_ID in env) {
      return lookup(env[PARENT_ID], id);
    }
    console.log(id + " not set in " + Object.keys(env));
  };

  var SPECIAL_FORMS = {
    "'quote": function(env, form) {
      return _second(form);
    },
    "'do": function(env, form) {
      var ret = null;
      var body = _rest(form);

      for (var i = 0; i < body.length; i++) {
	ret = _eval(env, body[i]);
      }

      return ret;
    },
    "'if": function(env, form) {
      return _eval(env, form[1]) ? _eval(env, form[2]) : _eval(env, form[3]);
    },
    "'let": function(env, form) {
      var binds = part(2, form[1]);

      var scope = binds.reduce(function (acc, pair) {
        acc[pair[0]] = _eval(env, pair[1]);
        return acc;
      }, {"'_PARENT": env});

      return _eval(scope, form[2]); // TODO doify 
    },
    "'def": function(env, form) {
      var bind = _rest(form);
      var name = _first(bind);

      if (!is_symbol(env, name)) throw new Error("Non-symbol found in LHS of `def` form: " + name);

      var val  = _eval(env, _second(bind));

      env[name] = val;
      return val;
    },
    "'λ": function(env, form) {
      var params = garner_bindings(env, _second(form));
      var body   = doify(_rest(_rest(form)));

      if (params.length < 2) return procedure(env, params, body);

      return auto_curry(procedure(env, params, body), params.length);
    }
  };
  
  var toString = Object.prototype.toString;

  var garner_type = function(obj) {
    return toString.call(obj);
  };

  var is_number = function (env, form) {
    return garner_type(form) == "[object Number]";
  }
  
  var is_string = function(env, form) {
    return garner_type(form) == "[object String]";
  }

  var is_bool = function(env, form) {
    return garner_type(form) == "[object Boolean]";
  }
  
  var is_seq = function(env, form) {
    return garner_type(form) == "[object Array]";
  }

  var is_fun = function(env, form) {
    return garner_type(form) == "[object Function]";
  }
  
  var is_symbol = function (env, form) {
    if (is_string(env, form)) {
      return form.charAt(0) == "'";
    }
    else {
      return false;
    }
  }

  var is_self_evaluating = function (env, form) {
    return is_number(env, form)
      || is_string(env, form)
      || is_bool(env, form);
  }

  var evlis = function(env, form) {
    var op = form[0];

    if ((form.length > 0) && (op in SPECIAL_FORMS)) {
      return SPECIAL_FORMS[form[0]](env, form);
    }
    else {
      var fn = _eval(env, op);

      if (is_fun(env, fn)) {
	var args = form.slice(1).map(e => _eval(env, e));
	return fn.apply(undefined, args);
      }
      else {
	throw new Error("Non-function found in head of array: " + op);
      }
    }
  }
    
  var _eval = function(env, form) {
    if (env === undefined) return _eval(CORE, form);
    
    var type = garner_type(form);
    
    if (is_symbol(env, form)) {
      return lookup(env, form);
    }
    else if (is_self_evaluating(env, form)) {
      return form;
    }
    else if (is_seq(env, form)) {
      return evlis(env, form);
    }
  }
  
  var read_quotation = function(input, list) {
    var binds = {};
    var has_elems = true;
    var index = 0;

    while(has_elems) {
      var token = input.shift();

      if (token === "|") {
        has_elems = false;
      } else if (token !== undefined) {
        binds[index++] = mangle(token);
      } else {
        throw new Error("Unknown form in quotation: " + token);
      }
    }

    list.push(binds);
    return list;
  }

  var toS = function(obj) {
    if (is_seq({}, obj)) {
      return "[" + obj.map(toS) + "]";
    }
    else {
      return "" + obj;
    }
  }
    
  var reader = function(input, list, qdepth = 0) {
    if (list === undefined) {
      return reader(input, []);
    } else {
      var token = input.shift();
      if (token === undefined) {
        return list.pop();
      } else if (token === "(") {
        list.push(reader(input, []));
        return reader(input, list);
      } else if (token === ")") {
        return list;
      } else if (token === "{") {
	var lbody = reader(input, []);
	lbody = _cons("'λ", lbody);
        list.push(lbody);
        return reader(input, list);
      } else if (token === "}") {
        return list;
      } else if (token === "|") {
        read_quotation(input, list);
	return reader(input, list);
      } else if (token === "'") {
	console.log(" " + token);
	console.log(" " + input);
	var qb = (list.length > 0) ? reader(input, []) : [reader(input, [])];
	console.log("> " + toS(qb));
	var qbody = _cons("'quote", qb);
	console.log(">> " + toS(qbody));
	
	if (list.length > 0) {
          list.push(qbody);
	  console.log(">>> " + toS(list));	  
          return list;
	}
	else {
	  return qbody;
	}
      } else {
        return reader(input, list.concat(mangle(token)));
      }
    }
  };

  var tokenize = function(input) {
    return input.split('"')
                .map(function(x, i) {
                   if (i % 2 === 0) { // not in string
                     return x.replace(/\(/g, ' ( ')
                       .replace(/\)/g, ' ) ')
                       .replace(/\{/g, ' { ')
                       .replace(/\}/g, ' } ')
                       .replace(/\|/g, ' | ')
                       .replace(/\'/g, " ' ");
                   } else { // in string
                     return x.replace(/ /g, "!whitespace!");
                   }
                 })
                .join('"')
                .trim()
                .split(/\s+/)
                .map(function(x) {
                  return x.replace(/!whitespace!/g, " ");
                });
  };

  var _read = function(s) {
    // TODO this doesn't work properly when called from the REPL
    // I believe there's a bug in the reader around strings.
    return reader(tokenize(s));
  };

  var CORE = {
    "'first": _first,
    "'rest":  _rest,
    "'head":  _head,
    "'cons":  _cons,
    "'read":  _read,
    "'eval":  flip(_eval),
    "'nil":   [],
    "'+":     _plus
  };

  var Rdr = function(str = null) {
    this.raw = str;
    this.index = 0;
    this.length = 0;
    this.sexpr = [];
    this.SPECIAL = ['(', ')'];
    this.CONTEXT = {};

    if (str) {
      this.sexpr = this.read_sexpr();
    }
  };

  Rdr.prototype.read_sexpr = function(src=null) {
    if (src) {
      this.raw = tokenize(src);
      this.length = this.raw.length;
      this.index = 0;
    }

    var token = this.read_token();
    var expr = null;

    return token;
  }

  Rdr.prototype.read_token = function() {
    if (this.index >= this.length) return null;

    console.log(">> " + garner_type(this.current()));
    
    if (this.SPECIAL.includes(this.current())) {
      return this.current();
    }
    else if(is_string(this.CONTEXT, this.current())) {
      var token = this.current();
      this.next();
      return mangle(token);
    }
  }

  Rdr.prototype.current = function() {
    return this.raw[this.index];
  }

  Rdr.prototype.next = function() {
    return this.index += 1;
  }
  
  function tokenizer ( s, parsers, deftok ) {
    var m, r, l, cnt, t, tokens = [];
    while ( s ) {
      t = null;
      m = s.length;
      for ( var key in parsers ) {
	r = parsers[ key ].exec( s );
	// try to choose the best match if there are several
	// where "best" is the closest to the current starting point
	if ( r && ( r.index < m ) ) {
          t = {
            token: r[ 0 ],
            type: key,
            matches: r.slice( 1 )
          }
          m = r.index;
	}
      }
      if ( m ) {
	// there is text between last token and currently 
	// matched token - push that out as default or "unknown"
	tokens.push({
          token : s.substr( 0, m ),
          type  : deftok || 'unknown'
	});
      }
      if ( t ) {
	// push current token onto sequence
	tokens.push( t ); 
      }
      s = s.substr( m + (t ? t.token.length : 0) );
    }
    return tokens;
  }
  
  exports.lisp = {
    VERSION: "0.0.5",
    read: _read,
    evil: _eval,
    read: _read,
    Rdr: Rdr,
    tokenize1: tokenize,
    tokenize2: tokenizer,
    core: CORE,
  };
})(typeof exports === 'undefined' ? this : exports);
