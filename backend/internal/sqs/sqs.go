package sqs

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"karpenter-pulse-backend/internal/handlers"
	"karpenter-pulse-backend/internal/models"
	"karpenter-pulse-backend/internal/state"
)

func StartSQSPoller(s *state.ClusterState, queueURL string) {
	handlers.PublishLog(fmt.Sprintf("Starting background AWS SQS Spot Interruption poller for queue: %s", queueURL), "INFO")
	
	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		handlers.PublishLog(fmt.Sprintf("ERROR: Failed to load AWS SDK config: %v. SQS polling stopped.", err), "ERROR")
		return
	}
	
	sqsClient := sqs.NewFromConfig(cfg)
	
	for {
		resp, err := sqsClient.ReceiveMessage(context.Background(), &sqs.ReceiveMessageInput{
			QueueUrl:            aws.String(queueURL),
			MaxNumberOfMessages: 10,
			WaitTimeSeconds:     20,
		})
		
		if err != nil {
			handlers.PublishLog(fmt.Sprintf("ERROR: Failed to receive SQS messages: %v. Retrying in 10s...", err), "ERROR")
			time.Sleep(10 * time.Second)
			continue
		}
		
		for _, msg := range resp.Messages {
			processSQSMessage(s, msg.Body)
			
			_, deleteErr := sqsClient.DeleteMessage(context.Background(), &sqs.DeleteMessageInput{
				QueueUrl:      aws.String(queueURL),
				ReceiptHandle: msg.ReceiptHandle,
			})
			if deleteErr != nil {
				handlers.PublishLog(fmt.Sprintf("ERROR: Failed to delete message %s from SQS queue: %v", *msg.MessageId, deleteErr), "ERROR")
			}
		}
	}
}

func processSQSMessage(s *state.ClusterState, body *string) {
	if body == nil {
		return
	}
	
	var event models.SQSMessageBody
	if err := json.Unmarshal([]byte(*body), &event); err != nil {
		handlers.PublishLog(fmt.Sprintf("WARNING: Failed to parse SQS message body as json: %v", err), "WARNING")
		return
	}
	
	if event.DetailType != "EC2 Spot Instance Interruption Notice" && 
		event.DetailType != "EC2 Instance Rebalance Recommendation" {
		return
	}
	
	instanceID := event.Detail.InstanceID
	if instanceID == "" && len(event.Resources) > 0 {
		parts := strings.Split(event.Resources[0], "/")
		if len(parts) > 1 {
			instanceID = parts[len(parts)-1]
		}
	}
	
	if instanceID == "" {
		handlers.PublishLog("WARNING: Received Spot warning notice with empty instance ID", "WARNING")
		return
	}
	
	nodeName := findNodeByInstanceID(s, instanceID)
	if nodeName == "" {
		handlers.PublishLog(fmt.Sprintf("INFO: Spot alert received for instance %s but no matching Kubernetes node found active.", instanceID), "INFO")
		return
	}
	
	eventTime := time.Now()
	if event.Time != "" {
		if parsedTime, parseErr := time.Parse(time.RFC3339, event.Time); parseErr == nil {
			eventTime = parsedTime
		}
	}
	
	deadline := eventTime.Add(2 * time.Minute)
	
	alertType := "SpotInterruption"
	severity := "CRITICAL"
	message := "Spot Interruption Warning: Instance will terminate in 2m 0s."
	
	if event.DetailType == "EC2 Instance Rebalance Recommendation" {
		alertType = "RebalanceRecommendation"
		severity = "WARNING"
		message = "EC2 Instance Rebalance Recommendation warning received."
	}
	
	alert := models.SpotAlert{
		Id:               "alert-" + instanceID,
		Type:             alertType,
		NodeName:         nodeName,
		InstanceId:       instanceID,
		Severity:         severity,
		Message:          message,
		Deadline:         deadline.Format(time.RFC3339),
		CountdownSeconds: int(time.Until(deadline).Seconds()),
	}
	
	s.AlertsMu.Lock()
	s.ActiveAlerts[alert.Id] = alert
	s.AlertsMu.Unlock()
	
	handlers.PublishLog(fmt.Sprintf("ALERT: Added %s alert for instance %s mapped to node %s (deadline: %s)", 
		alertType, instanceID, nodeName, alert.Deadline), "WARNING")
}

func findNodeByInstanceID(s *state.ClusterState, instanceID string) string {
	if s.Clientset == nil {
		return ""
	}
	
	nodes, err := s.Clientset.CoreV1().Nodes().List(context.Background(), metav1.ListOptions{})
	if err != nil {
		log.Printf("ERROR: Failed to query nodes for SQS mapping: %v\n", err)
		return ""
	}
	
	for _, node := range nodes.Items {
		if strings.Contains(node.Spec.ProviderID, instanceID) {
			return node.Name
		}
	}
	
	return ""
}
