#!/usr/bin/env python3
import sys
import re

def bump_patch_version(version_str):
    # Regex to match semver: major.minor.patch[-prerelease]
    match = re.match(r'^(\d+)\.(\d+)\.(\d+)(-.+)?$', version_str)
    if not match:
        raise ValueError(f"Invalid semver format: {version_str}")
    major, minor, patch, prerelease = match.groups()
    patch = int(patch) + 1
    new_version = f"{major}.{minor}.{patch}"
    if prerelease:
        new_version += prerelease
    return new_version

def update_chart_yaml(file_path, new_app_version):
    # Strip leading 'v' if present
    if new_app_version.startswith('v'):
        new_app_version = new_app_version[1:]

    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    current_version = None
    
    # First pass: find the current version
    version_pattern = re.compile(r'^version:\s*["\']?([^"\']+)["\']?\s*$')
    for line in lines:
        match = version_pattern.match(line.strip())
        if match:
            current_version = match.group(1)
            break

    if not current_version:
        raise ValueError(f"Could not find 'version' field in {file_path}")

    updated_version = bump_patch_version(current_version)
    print(f"File: {file_path}")
    print(f"  Old version: {current_version} -> New version: {updated_version}")
    print(f"  Setting appVersion to: {new_app_version}")

    new_lines = []
    # Second pass: write updated version and appVersion
    for line in lines:
        if line.startswith('version:'):
            # Preserve quoting style if any
            quotes_match = re.match(r'^version:\s*(["\']?).*$', line)
            quote = quotes_match.group(1) if quotes_match else ''
            new_lines.append(f"version: {quote}{updated_version}{quote}\n")
        elif line.startswith('appVersion:'):
            quotes_match = re.match(r'^appVersion:\s*(["\']?).*$', line)
            quote = quotes_match.group(1) if quotes_match else '"'
            new_lines.append(f"appVersion: {quote}{new_app_version}{quote}\n")
        else:
            new_lines.append(line)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python bump-version.py <path_to_chart_yaml> <new_app_version>")
        sys.exit(1)
    
    chart_path = sys.argv[1]
    app_version = sys.argv[2]
    try:
        update_chart_yaml(chart_path, app_version)
    except Exception as e:
        print(f"Error updating chart version: {e}", file=sys.stderr)
        sys.exit(1)
