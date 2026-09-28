{{- define "workflow-platform.name" -}}workflow-platform{{- end }}
{{- define "workflow-platform.fullname" -}}{{ .Release.Name }}-platform{{- end }}
{{- define "workflow-platform.labels" -}}
app.kubernetes.io/name: {{ include "workflow-platform.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
{{- define "workflow-platform.serviceAccount" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "workflow-platform.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- required "serviceAccount.name is required when create=false" .Values.serviceAccount.name -}}
{{- end -}}
{{- end }}
{{- define "workflow-platform.image" -}}
{{- $image := index .Values.images .component -}}
{{- if $image.digest -}}
{{- printf "%s@%s" $image.repository $image.digest -}}
{{- else -}}
{{- printf "%s:%s" $image.repository (default .Chart.AppVersion $image.tag) -}}
{{- end -}}
{{- end }}
