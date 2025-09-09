import requests
import json

# Current version of app (gotta make sure to change with each relaease :)
CURRENT_VERSION = "1.0.0"
GITHUB_REPO = "ComradeAleks/Abiotic-Factor-Interactive-maps"

def get_latest_version():
    """Get the latest release version from GitHub"""
    try:
        url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            return data.get('tag_name', '').lstrip('v')
        return None
    except Exception:
        return None

def compare_versions(current, latest):
    """Compare version strings (simple semantic versioning)"""
    if not latest:
        return "unknown"
    
    try:
        current_parts = [int(x) for x in current.split('.')]
        latest_parts = [int(x) for x in latest.split('.')]
        
        # Pad shorter version with zeros
        while len(current_parts) < len(latest_parts):
            current_parts.append(0)
        while len(latest_parts) < len(current_parts):
            latest_parts.append(0)
        
        if current_parts < latest_parts:
            return "outdated"
        elif current_parts > latest_parts:
            return "newer"
        else:
            return "current"
    except:
        return "unknown"

def get_version_info():
    """Get version info for the app title"""
    latest_version = get_latest_version()
    status = compare_versions(CURRENT_VERSION, latest_version)
    
    if status == "outdated":
        return f"v{CURRENT_VERSION} - Outdated"
    elif status == "current":
        return f"v{CURRENT_VERSION}"
    elif status == "newer":
        return f"v{CURRENT_VERSION} - Dev"
    else:
        return f"v{CURRENT_VERSION}"

def get_window_title():
    """Get the complete window title with version info"""
    version_info = get_version_info()
    return f"Abiotic Factor Interactive Maps - {version_info}"

if __name__ == "__main__":
    print(f"Current version: {CURRENT_VERSION}")
    latest = get_latest_version()
    if latest:
        print(f"Latest version: {latest}")
        status = compare_versions(CURRENT_VERSION, latest)
        print(f"Status: {status}")
    else:
        print("Could not check latest version")
    
    print(f"Window title: {get_window_title()}")
