{{- define "gigalibs-ar.name" -}}gigalibs-ar{{- end }}
{{- define "gigalibs-ar.fullname" -}}{{ .Release.Name }}-ar{{- end }}
{{- define "gigalibs-ar.labels" -}}
app.kubernetes.io/name: {{ include "gigalibs-ar.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
{{- define "gigalibs-ar.serviceAccount" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "gigalibs-ar.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- required "serviceAccount.name is required when create=false" .Values.serviceAccount.name -}}
{{- end -}}
{{- end }}
{{- define "gigalibs-ar.image" -}}
{{- $image := index .Values.images .component -}}
{{- printf "%s@%s" (required (printf "images.%s.repository is required" .component) $image.repository) (required (printf "images.%s.digest is required" .component) $image.digest) -}}
{{- end }}
