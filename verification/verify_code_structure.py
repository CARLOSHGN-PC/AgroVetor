
import re

def verify_code_structure():
    with open('docs/app.js', 'r') as f:
        app_js_content = f.read()

    # 1. Check for App.applicationEntry definition
    if 'applicationEntry:' not in app_js_content:
        print("FAIL: App.applicationEntry module definition not found.")
        return False

    # 2. Check for saveApplicationEntry action definition
    if 'async saveApplicationEntry() {' not in app_js_content:
        print("FAIL: App.actions.saveApplicationEntry function definition not found.")
        return False

    # 3. Check for shiftColors
    if 'shiftColors:' not in app_js_content:
        print("FAIL: shiftColors definition not found.")
        return False

    # 4. Check for partial area logic (Turf.js) usage
    if 'turf.intersect' not in app_js_content:
        print("FAIL: Turf.js intersection logic not found.")
        return False

    print("SUCCESS: Code structure verification passed.")
    return True

if __name__ == "__main__":
    if verify_code_structure():
        exit(0)
    else:
        exit(1)
