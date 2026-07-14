# Technical Specification: Spot Interruption Alerting Engine

**Status:** Approved for Implementation  
**Role Context:** [@Product Engineer](.agents/product_engineer.md)  
**Target Audience:** Go Backend Engineers, DevOps / SRE Teams  

---

## 1. Context & Motivation

AWS Spot Instances provide significant cost savings but are subject to termination by AWS with a **2-minute warning** (Spot Instance Interruption Notice) or a **Rebalance Recommendation**. 

For SRE and DevOps teams running workloads on Karpenter, it is critical to observe these interruptions in real time. Spot interruptions trigger pod evictions, draining, and node scaling. Seeing the 2-minute countdown on the Karpenter Pulse dashboard helps distinguish planned Spot rebalancing from unexpected cluster failures.

---

## 2. Infrastructure Architecture & Event Flow

```text
+-----------------------+      Rule      +--------------------+
|  AWS EventBridge      | -------------> |   Amazon SQS       |
|  (CloudWatch Events)  |                |   Queue            |
+-----------------------+                +--------------------+
            |                                       |
            | EC2 Spot Interruption Notice          | SQS Long Poll
            v                                       v
+-----------------------+                +--------------------+
|  AWS EC2 Instance     |                | Karpenter Pulse    |
|  (Interrupted)        |                | Go Backend Service |
+-----------------------+                +--------------------+
                                                    |
                                                    | REST /api/resources
                                                    v
                                         +--------------------+
                                         | React Frontend UI  |
                                         | (Red Alert Glow)   |
                                         +--------------------+
```

### Event Sources (AWS CloudWatch / EventBridge)
We watch for two specific EC2 events:
1. **EC2 Spot Instance Interruption Warning:**
   - Detail Type: `EC2 Spot Instance Interruption Notice`
2. **EC2 Instance Rebalance Recommendation:**
   - Detail Type: `EC2 Instance Rebalance Recommendation`

---

## 3. SQS Message Schemas

AWS EventBridge wraps the event into an SQS message. The Go backend must parse this body.

### A. Spot Interruption Event Payload
```json
{
  "version": "0",
  "id": "12345678-1234-1234-1234-123456789012",
  "detail-type": "EC2 Spot Instance Interruption Notice",
  "source": "aws.ec2",
  "account": "123456789012",
  "time": "2026-07-13T11:58:30Z",
  "region": "us-east-1",
  "resources": [
    "arn:aws:ec2:us-east-1:123456789012:instance/i-0abcdef1234567890"
  ],
  "detail": {
    "instance-id": "i-0abcdef1234567890",
    "action": "terminate"
  }
}
```

### B. Rebalance Recommendation Payload
```json
{
  "version": "0",
  "id": "87654321-4321-4321-4321-210987654321",
  "detail-type": "EC2 Instance Rebalance Recommendation",
  "source": "aws.ec2",
  "account": "123456789012",
  "time": "2026-07-13T11:57:00Z",
  "region": "us-east-1",
  "resources": [
    "arn:aws:ec2:us-east-1:123456789012:instance/i-0abcdef1234567890"
  ],
  "detail": {
    "instance-id": "i-0abcdef1234567890"
  }
}
```

---

## 4. IAM Permissions (DevOps/SRE configuration)

The IAM Role assigned to the Karpenter Pulse backend ServiceAccount (via EKS IRSA) must have permissions to read from the SQS queue:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:us-east-1:123456789012:karpenter-pulse-interruption-queue"
    }
  ]
}
```

---

## 5. Go Backend Logic (`backend/`)

### A. Configuration
The backend loads the following environment variables:
- `SQS_QUEUE_URL`: The URL of the Amazon SQS queue. If empty, the backend logs a warning and disables SQS polling (running in mock fallback mode).
- `AWS_REGION`: AWS region (e.g. `us-east-1`).

### B. SQS Polling Goroutine
A background goroutine utilizes the AWS SDK (`github.com/aws/aws-sdk-go-v2/service/sqs`) to long-poll SQS messages (`WaitTimeSeconds: 20`).

```go
type SQSMessageBody struct {
	DetailType string   `json:"detail-type"`
	Time       string   `json:"time"`
	Resources  []string `json:"resources"`
	Detail     struct {
		InstanceID string `json:"instance-id"`
		Action     string `json:"action"`
	} `json:"detail"`
}
```

### C. Kubernetes Node Mapping
When an event for instance `i-0abcdef1234567890` is received:
1. Iterate over active Kubernetes Nodes.
2. Check `Node.Spec.ProviderID` (which matches `aws:///us-east-1a/i-0abcdef1234567890`).
3. If a match is found (e.g. Node `ip-10-0-1-145.ec2.internal`), generate a Spot Interruption Alert.
4. Set the alert `deadline` to `eventTime + 2 minutes`.
5. Keep active alerts in an in-memory thread-safe map. Remove them once the Kubernetes Node object is deleted from the cluster.

---

## 6. API & UI Data Contract

The JSON payload returned by `GET /api/resources` is extended with an `alerts` property.

```json
{
  "source": "cluster",
  "nodes": [...],
  "nodepools": [...],
  "alerts": [
    {
      "id": "alert-i-0abcdef1234567890",
      "type": "SpotInterruption",
      "nodeName": "ip-10-0-1-145.ec2.internal",
      "instanceId": "i-0abcdef1234567890",
      "severity": "CRITICAL",
      "message": "Spot Interruption Warning: Instance will terminate in 1m 15s.",
      "deadline": "2026-07-13T12:00:30Z",
      "countdownSeconds": 75
    }
  ]
}
```

### Frontend UI Treatment:
- **Global Alarm Banner:** Displays a list of active AWS events at the top of the dashboard.
- **Node List Highlight:** Flashes the node row with a pulsing red warning outline.
- **Badge override:** Replaces the standard `Ready` or `Terminating` badge with a flashing red `INTERRUPTED` badge showing the countdown timer (e.g. `[1:15]`).

---

## 7. Sandbox Simulator Mode (Local Testing)

To test the integration locally without SQS connections:
- A new button **"Simulate Spot Interruption"** is added to the Sandbox banner.
- Clicking this triggers the Go backend (or frontend sandbox) to select an active Spot node (e.g. `ip-10-0-1-145.ec2.internal`).
- It generates a mock Spot Interruption alert with a `120s` timer.
- Outputs logs:
  - `[12:00:00Z] WARNING spot-interruption SQS Message: EC2 Spot Instance Interruption Notice for i-0abcdef1234567890.`
  - `[12:00:01Z] WARNING spot-interruption Node "ip-10-0-1-145.ec2.internal" flagged for termination; draining pods...`
- The timer counts down in real-time in the UI. When it hits zero, the node is consolidated and removed.
