#!/usr/bin/env python3
import sys
import re

def extract_semver(tag_str):
    if not tag_str:
        return tag_str
    # Strip any ref prefix
    tag = tag_str.split('/')[-1]
    # Strip project name prefix: e.g. karpenter-pulse-v1.0.0 or karpenter-pulse-1.0.0
    if tag.startswith('karpenter-pulse-'):
        tag = tag[len('karpenter-pulse-'):]
    if tag.startswith('v'):
        tag = tag[1:]
    # Extract semver pattern: major.minor.patch[-prerelease]
    match = re.search(r'(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)', tag)
    if match:
        return match.group(1)
    return tag

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

def update_chart_yaml(file_path, tag_or_version):
    target_version = extract_semver(tag_or_version)

    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    current_version = None
    
    # First pass: find current version
    version_pattern = re.compile(r'^version:\s*["\']?([^"\']+)["\']?\s*$')
    for line in lines:
        match = version_pattern.match(line.strip())
        if match:
            current_version = match.group(1)
            break

    if not current_version:
        raise ValueError(f"Could not find 'version' field in {file_path}")

    print(f"File: {file_path}")
    print(f"  Current version: {current_version} -> Setting chart version to tag: {target_version}")
    print(f"  Setting appVersion to: {target_version}")

    new_lines = []
    # Second pass: write updated version, appVersion, and dependencies
    for line in lines:
        if line.startswith('version:'):
            quotes_match = re.match(r'^version:\s*(["\']?).*$', line)
            quote = quotes_match.group(1) if quotes_match else ''
            new_lines.append(f"version: {quote}{target_version}{quote}\n")
        elif line.startswith('appVersion:'):
            quotes_match = re.match(r'^appVersion:\s*(["\']?).*$', line)
            quote = quotes_match.group(1) if quotes_match else '"'
            new_lines.append(f"appVersion: {quote}{target_version}{quote}\n")
        elif re.match(r'^\s+version:\s*', line):
            quotes_match = re.match(r'^(\s*version:\s*)(["\']?).*$', line)
            prefix = quotes_match.group(1)
            quote = quotes_match.group(2) if quotes_match else ''
            new_lines.append(f"{prefix}{quote}{target_version}{quote}\n")
        else:
            new_lines.append(line)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python bump-version.py <path_to_chart_yaml> <tag_or_version>")
        sys.exit(1)
    
    chart_path = sys.argv[1]
    tag_name = sys.argv[2]
    try:
        update_chart_yaml(chart_path, tag_name)
    except Exception as e:
        print(f"Error updating chart version: {e}", file=sys.stderr)
        sys.exit(1)
