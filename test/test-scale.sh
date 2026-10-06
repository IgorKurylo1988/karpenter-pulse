#!/usr/bin/env bash
# ==============================================================================
# Karpenter Pulse: Scaling Test Script (Bash)
# ==============================================================================

set -euo pipefail

REPLICAS="${1:-5}"

echo "============================================================"
echo "   ⚡ Karpenter Pulse Scaling Test ($REPLICAS Replicas)      "
echo "============================================================"

echo -e "\nScaling deployment 'inflate' to $REPLICAS replicas..."
kubectl scale deployment inflate --replicas="$REPLICAS"

if [ "$REPLICAS" -gt 0 ]; then
  echo -e "\n✅ Submitted $REPLICAS pods requiring 1 CPU & 1.5Gi memory each."
  echo "👀 Open your Karpenter Pulse UI at http://localhost:8080"
  echo "   - Live Logs: Observe 'Found 1 provisionable Pod(s)' and instance selection"
  echo "   - NodeClaims: Watch the spot instance claim transition to Ready"
  echo "   - FinOps: See spot discount & cost breakdown update in real time!"
  echo ""
  echo "Current Pod Status:"
  kubectl get pods -l app=inflate -o wide
  echo ""
  echo "Current Karpenter NodeClaims:"
  kubectl get nodeclaims -o wide 2>/dev/null || true
else
  echo -e "\n✅ Scaled down inflate workload to 0 pods."
  echo "👀 Karpenter consolidation policy (WhenEmptyOrUnderutilized) is active."
  echo "   Within 60-90 seconds, Karpenter will terminate the idle EC2 spot node."
  echo ""
  echo "Current Karpenter NodeClaims:"
  kubectl get nodeclaims -o wide 2>/dev/null || true
fi
