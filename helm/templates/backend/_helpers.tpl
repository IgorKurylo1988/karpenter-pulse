{{/*
Backend component name
*/}}
{{- define "backend.name" -}}
{{- printf "%s-backend" (include "karpenter-pulse.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Backend fullname: <release>-backend
*/}}
{{- define "backend.fullname" -}}
{{- printf "%s-backend" (include "karpenter-pulse.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Backend labels
*/}}
{{- define "backend.labels" -}}
{{ include "karpenter-pulse.labels" . }}
{{ include "backend.selectorLabels" . }}
app.kubernetes.io/component: backend
{{- end }}

{{/*
Backend selector labels
*/}}
{{- define "backend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "backend.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the backend service account to use
*/}}
{{- define "backend.serviceAccountName" -}}
{{- if .Values.backend.serviceAccount.create }}
{{- default (include "backend.fullname" .) .Values.backend.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.backend.serviceAccount.name }}
{{- end }}
{{- end }}
