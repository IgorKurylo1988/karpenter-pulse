{{/*
Expand the name of the chart.
*/}}
{{- define "karpenter-pulse.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this.
*/}}
{{- define "karpenter-pulse.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "karpenter-pulse.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels across all resources
*/}}
{{- define "karpenter-pulse.labels" -}}
helm.sh/chart: {{ include "karpenter-pulse.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
{{- end }}

{{/*
Backend component name: karpenter-pulse-brain
*/}}
{{- define "karpenter-pulse.backendName" -}}
{{- if and .Values.backend .Values.backend.nameOverride }}
{{- .Values.backend.nameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-brain" (include "karpenter-pulse.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Backend fullname: <release>-karpenter-pulse-brain or karpenter-pulse-brain
*/}}
{{- define "karpenter-pulse.backendFullname" -}}
{{- if and .Values.backend .Values.backend.fullnameOverride }}
{{- .Values.backend.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-brain" (include "karpenter-pulse.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Backend selector labels
*/}}
{{- define "karpenter-pulse.backendSelectorLabels" -}}
app.kubernetes.io/name: {{ include "karpenter-pulse.backendName" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Backend labels
*/}}
{{- define "karpenter-pulse.backendLabels" -}}
{{ include "karpenter-pulse.labels" . }}
{{ include "karpenter-pulse.backendSelectorLabels" . }}
app.kubernetes.io/component: brain
{{- end }}

{{/*
Frontend component name: karpenter-pulse-web
*/}}
{{- define "karpenter-pulse.frontendName" -}}
{{- if and .Values.frontend .Values.frontend.nameOverride }}
{{- .Values.frontend.nameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-web" (include "karpenter-pulse.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Frontend fullname: <release>-karpenter-pulse-web or karpenter-pulse-web
*/}}
{{- define "karpenter-pulse.frontendFullname" -}}
{{- if and .Values.frontend .Values.frontend.fullnameOverride }}
{{- .Values.frontend.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-web" (include "karpenter-pulse.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Frontend selector labels
*/}}
{{- define "karpenter-pulse.frontendSelectorLabels" -}}
app.kubernetes.io/name: {{ include "karpenter-pulse.frontendName" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Frontend labels
*/}}
{{- define "karpenter-pulse.frontendLabels" -}}
{{ include "karpenter-pulse.labels" . }}
{{ include "karpenter-pulse.frontendSelectorLabels" . }}
app.kubernetes.io/component: web
{{- end }}

{{/*
Create the name of the backend service account to use
*/}}
{{- define "karpenter-pulse.serviceAccountName" -}}
{{- if and .Values.backend .Values.backend.serviceAccount .Values.backend.serviceAccount.create }}
{{- default (include "karpenter-pulse.backendFullname" .) .Values.backend.serviceAccount.name }}
{{- else if and .Values.backend .Values.backend.serviceAccount }}
{{- default "default" .Values.backend.serviceAccount.name }}
{{- else }}
{{- "default" }}
{{- end }}
{{- end }}
