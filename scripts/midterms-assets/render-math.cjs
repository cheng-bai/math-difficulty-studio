const fs = require('node:fs');
const vm = require('node:vm');
const context = {module:{exports:{}},exports:{}};
vm.runInNewContext(fs.readFileSync(process.argv[2], 'utf8'), context);
const katex = context.module.exports;
const formulas = JSON.parse(fs.readFileSync(0, 'utf8'));
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
process.stdout.write(JSON.stringify(formulas.map(({tex, display}) => {
  try {
    return {html:katex.renderToString(tex, {displayMode:display, throwOnError:true, strict:'ignore', trust:false, output:'htmlAndMathml', maxExpand:1000})};
  } catch (error) {
    return {html:'<code class="math-error" title="公式待校">'+escape(tex)+'</code>',error:error.message};
  }
})));
