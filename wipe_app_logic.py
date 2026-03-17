import re

with open('docs/app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

# I will replace `document.getElementById` to use a wrapper so that it doesn't return null and crash if the element doesn't exist, except for known ones.
wrapper_func = """
function safeGetElementById(id) {
    let el = document.getElementById(id);
    if (!el) {
        // Return a proxy that absorbs calls and properties
        return new Proxy(document.createElement('div'), {
            get(target, prop) {
                if (prop in target) {
                    if (typeof target[prop] === 'function') {
                        return target[prop].bind(target);
                    }
                    return target[prop];
                }
                return () => new Proxy({}, this);
            },
            set(target, prop, value) {
                target[prop] = value;
                return true;
            }
        });
    }
    return el;
}
"""

app_js = app_js.replace("document.getElementById(", "safeGetElementById(")

app_js = wrapper_func + app_js

with open('docs/app.js', 'w', encoding='utf-8') as f:
    f.write(app_js)
