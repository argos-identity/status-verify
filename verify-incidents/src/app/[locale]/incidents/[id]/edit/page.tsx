"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Save,
  X,
  Loader2,
  AlertTriangle,
  Trash2
} from 'lucide-react';
import Link from 'next/link';
import Header from '@/components/sections/header';
import Footer from '@/components/sections/footer';
import IncidentTimeline from '@/components/sections/incident-timeline';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useIncident } from '@/hooks/use-incidents';
import apiClient from '@/lib/api-client';
import type { Incident, IncidentStatus, IncidentPriority, IncidentSeverity } from '@/lib/types';
import { formatServiceName } from '@/lib/utils';

export default function IncidentEditPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const t = useTranslations('incident.edit');
  const tf = useTranslations('incident.create.form');
  const ti = useTranslations('incidents');

  const incidentId = params.id as string;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load incident data
  const {
    incident: originalIncident,
    updates,
    loading,
    error: loadError,
    refresh
  } = useIncident(incidentId);

  // Form state
  const [formData, setFormData] = useState<Partial<Incident>>({});

  // Initialize form data when incident loads
  useEffect(() => {
    if (originalIncident) {
      setFormData({
        title: originalIncident.title,
        description: originalIncident.description,
        status: originalIncident.status,
        priority: originalIncident.priority,
        severity: originalIncident.severity,
        affected_services: originalIncident.affected_services,
        detection_criteria: originalIncident.detection_criteria,
        reporter: originalIncident.reporter
      });
    }
  }, [originalIncident]);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(`/auth/login?callbackUrl=/incidents/${incidentId}/edit`);
    }
  }, [status, router, incidentId]);

  // Show loading while checking auth or loading incident
  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-4xl px-6 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>{t('loading')}</span>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Show error if incident not found or load error
  if (loadError || !originalIncident) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-4xl px-6 py-8">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {loadError || t('errors.notFound', { id: incidentId })}
            </AlertDescription>
          </Alert>
          <div className="mt-4 flex items-center gap-2">
            <Link href="/incidents">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('returnToList')}
              </Button>
            </Link>
            <Button variant="outline" onClick={refresh}>
              <Loader2 className="w-4 h-4 mr-2" />
              {t('buttons.retry')}
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const handleSave = async () => {
    if (!formData.title?.trim()) {
      setError(t('errors.titleRequired'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 인증 토큰 설정
      if (session?.accessToken) {
        apiClient.setAuthToken(session.accessToken as string);
      }

      // 백엔드가 요구하는 형식으로 데이터 변환
      const updateData = {
        title: formData.title,
        description: formData.description,
        status: formData.status,
        severity: formData.severity,
        priority: formData.priority,
        affected_services: formData.affected_services || [],
        detection_criteria: formData.detection_criteria,
        reporter: formData.reporter
      };

      // 실제 API 호출
      const updatedIncident = await apiClient.updateIncident(incidentId, updateData);

      console.log('Updated incident:', updatedIncident);

      // 성공 메시지와 함께 상세 페이지로 이동 (쿼리 파라미터 제거)
      router.push(`/incidents/${incidentId}`);

    } catch (err: any) {
      console.error('Failed to save incident:', err);

      // 에러 메시지 설정
      if (err.status === 401) {
        setError(t('errors.authenticationRequired'));
        router.push(`/auth/login?callbackUrl=/incidents/${incidentId}/edit`);
      } else if (err.status === 403) {
        setError(t('errors.permissionDenied'));
      } else if (err.status === 404) {
        setError(t('errors.incidentNotFound'));
      } else if (err.status === 0) {
        setError(t('errors.serverConnectionFailed'));
      } else {
        setError(err.message || t('errors.saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmDelete = confirm(t('confirmations.deleteConfirm'));
    if (!confirmDelete) return;

    try {
      // 인증 토큰 설정
      if (session?.accessToken) {
        apiClient.setAuthToken(session.accessToken as string);
      }

      // 삭제 API 호출
      await apiClient.deleteIncident(incidentId);

      console.log('Incident deleted successfully');

      // 목록 페이지로 이동
      router.push('/incidents');

    } catch (err: any) {
      console.error('Failed to delete incident:', err);

      // 에러 메시지 설정
      if (err.status === 401) {
        setError(t('errors.authenticationRequired'));
      } else if (err.status === 403) {
        setError(t('errors.permissionDenied'));
      } else if (err.status === 404) {
        setError(t('errors.incidentNotFound'));
      } else if (err.status === 0) {
        setError(t('errors.serverConnectionFailed'));
      } else {
        setError(err.message || t('errors.deleteFailed'));
      }
    }
  };

  const handleAddUpdate = async (updateData: { status: IncidentStatus; description: string }) => {
    try {
      // 인증 토큰 설정
      if (session?.accessToken) {
        apiClient.setAuthToken(session.accessToken as string);
      }

      // API 호출로 업데이트 추가
      await apiClient.addIncidentUpdate(incidentId, {
        status: updateData.status,
        description: updateData.description,
      });

      // 데이터 새로고침
      await refresh();

      console.log('Update added successfully:', updateData);
    } catch (error) {
      console.error('Failed to add update:', error);
      alert(t('errors.updateAddFailed'));
    }
  };

  const handleFieldChange = (field: keyof Incident, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleServiceToggle = (service: string) => {
    const currentServices = formData.affected_services || [];
    const newServices = currentServices.includes(service)
      ? currentServices.filter(s => s !== service)
      : [...currentServices, service];

    handleFieldChange('affected_services', newServices);
  };

  const availableServices = [
    'id-recognition',
    'face-liveness',
    'id-liveness',
    'face-compare',
    'curp-verifier'
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href={`/incidents/${incidentId}`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('buttons.back')}
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs">
                  {incidentId}
                </Badge>
                <span className="text-xs text-muted-foreground">{t('editMode')}</span>
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                {t('title')}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t('buttons.delete')}
            </Button>
            <Link href={`/incidents/${incidentId}`}>
              <Button variant="outline" size="sm">
                <X className="w-4 h-4 mr-2" />
                {t('buttons.cancel')}
              </Button>
            </Link>
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {t('buttons.save')}
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Form */}
        <div className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>{t('basicInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{tf('titleLabel')}</label>
                <Input
                  value={formData.title || ''}
                  onChange={(e) => handleFieldChange('title', e.target.value)}
                  placeholder={tf('titlePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{tf('descriptionLabel')}</label>
                <Textarea
                  value={formData.description || ''}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  placeholder={tf('descriptionPlaceholder')}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{tf('detectionCriteriaLabel')}</label>
                <Textarea
                  value={formData.detection_criteria || ''}
                  onChange={(e) => handleFieldChange('detection_criteria', e.target.value)}
                  placeholder={tf('detectionCriteriaPlaceholder')}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{tf('reporterLabel')}</label>
                <Input
                  value={formData.reporter || ''}
                  onChange={(e) => handleFieldChange('reporter', e.target.value)}
                  placeholder={tf('reporterPlaceholder')}
                />
              </div>
            </CardContent>
          </Card>

          {/* Status and Priority */}
          <Card>
            <CardHeader>
              <CardTitle>{t('statusAndPriority')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{tf('statusLabel')}</label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => handleFieldChange('status', value as IncidentStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={tf('statusPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="investigating">{ti('status.investigating')}</SelectItem>
                      <SelectItem value="identified">{ti('status.identified')}</SelectItem>
                      <SelectItem value="monitoring">{ti('status.monitoring')}</SelectItem>
                      <SelectItem value="resolved">{ti('status.resolved')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">{tf('priorityLabel')}</label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => handleFieldChange('priority', value as IncidentPriority)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={tf('priorityPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="P1">{ti('priority.p1')}</SelectItem>
                      <SelectItem value="P2">{ti('priority.p2')}</SelectItem>
                      <SelectItem value="P3">{ti('priority.p3')}</SelectItem>
                      <SelectItem value="P4">{ti('priority.p4')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">{tf('severityLabel')}</label>
                  <Select
                    value={formData.severity}
                    onValueChange={(value) => handleFieldChange('severity', value as IncidentSeverity)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={tf('severityPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">{ti('severity.critical')}</SelectItem>
                      <SelectItem value="high">{ti('severity.high')}</SelectItem>
                      <SelectItem value="medium">{ti('severity.medium')}</SelectItem>
                      <SelectItem value="low">{ti('severity.low')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Affected Services */}
          <Card>
            <CardHeader>
              <CardTitle>{t('affectedServices')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {tf('affectedServicesDescription')}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {availableServices.map((service) => (
                    <label
                      key={service}
                      className="flex items-center space-x-2 cursor-pointer p-2 rounded border hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        checked={formData.affected_services?.includes(service) || false}
                        onChange={() => handleServiceToggle(service)}
                        className="rounded border-border"
                      />
                      <span className="text-sm">{formatServiceName(service)}</span>
                    </label>
                  ))}
                </div>
                {formData.affected_services && formData.affected_services.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-2 border-t">
                    <span className="text-sm text-muted-foreground">{tf('selectedServices')}</span>
                    {formData.affected_services.map((service) => (
                      <Badge key={service} variant="outline">
                        {formatServiceName(service)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Update History Timeline */}
          {originalIncident && (
            <div className="mt-8">
              <IncidentTimeline
                incidentId={incidentId}
                updates={updates || []}
                currentStatus={originalIncident.status}
                onAddUpdate={handleAddUpdate}
                canEdit={originalIncident.status !== 'resolved'}
              />
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}