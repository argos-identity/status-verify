"use client";

import { useState, useEffect, useCallback } from 'react';
import { Plus, Filter, Search, RefreshCw, AlertCircle } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import Header from '@/components/sections/header';
import Footer from '@/components/sections/footer';
import IncidentList from '@/components/sections/incident-list';
import IncidentDashboard from '@/components/sections/incident-dashboard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useIncidents, useIncidentStats } from '@/hooks/use-incidents';
import { useAuth } from '@/hooks/use-auth';
import type { IncidentFilters } from '@/lib/types';
import { handleKeyboardShortcut } from '@/lib/utils';

export default function IncidentsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<IncidentFilters>({
    status: 'all',
    priority: 'all',
    severity: 'all',
    affected_service: 'all'
  });

  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const t = useTranslations('incidents');
  const tCommon = useTranslations('common');

  // Use API hooks instead of mock data
  const {
    incidents: allIncidents,
    loading: incidentsLoading,
    error: incidentsError,
    refresh: refreshIncidents
  } = useIncidents();

  const {
    stats,
    loading: statsLoading,
    error: statsError,
    refresh: refreshStats
  } = useIncidentStats();

  // Client-side filtering for search and additional filters
  const filteredIncidents = allIncidents.filter(incident => {
    const matchesSearch =
      incident.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      incident.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      incident.reporter?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = filters.status === 'all' || incident.status === filters.status;
    const matchesPriority = filters.priority === 'all' || incident.priority === filters.priority;
    const matchesSeverity = filters.severity === 'all' || incident.severity === filters.severity;
    const matchesService = filters.affected_service === 'all' ||
      incident.affected_services.includes(filters.affected_service as string);

    return matchesSearch && matchesStatus && matchesPriority && matchesSeverity && matchesService;
  });

  // Handle refresh
  const handleRefresh = async () => {
    await Promise.all([refreshIncidents(), refreshStats()]);
  };

  // Handle New Failure Event button click
  const handleNewFailureEvent = useCallback(() => {
    if (!isAuthenticated) {
      router.push('/auth/login?callbackUrl=/incidents/create');
    } else {
      router.push('/incidents/create');
    }
  }, [isAuthenticated, router]);

  // 키보드 단축키 처리
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      handleKeyboardShortcut(event, {
        new: () => handleNewFailureEvent(),
        save: () => {},
        cancel: () => {}
      });
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleNewFailureEvent]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        {/* 페이지 헤더 */}
        <div className="flex flex-col gap-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
{t('title')}
              </h1>
              <p className="text-muted-foreground mt-1">
{t('subtitle')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleRefresh}
                disabled={incidentsLoading || statsLoading}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${(incidentsLoading || statsLoading) ? 'animate-spin' : ''}`} />
{t('refresh')}
              </Button>
              {/* TODO: 향후 활성화를 위해 임시 비활성화
              <Button
                onClick={handleNewFailureEvent}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90"
                disabled={authLoading}
              >
                <Plus className="w-4 h-4" />
                New Failure Event
              </Button>
              */}
            </div>
          </div>

          {/* Error Display */}
          {(incidentsError || statsError) && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {incidentsError || statsError}
                {((incidentsError && incidentsError.includes('Permission denied')) ||
                  (statsError && statsError.includes('Permission denied'))) && (
                  <div className="mt-2">
                    <Link href="/auth/login">
                      <Button size="sm" variant="outline">
{t('loginToSeeMore')}
                      </Button>
                    </Link>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* 통계 대시보드 */}
          <IncidentDashboard stats={stats} loading={statsLoading} />
        </div>

        {/* 검색 및 필터 섹션 */}
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <div className="flex flex-col gap-4">
            {/* 검색바 */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
placeholder={t('searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* 필터들 */}
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
<span className="text-sm font-medium text-muted-foreground">{tCommon('filter')}:</span>
              </div>

              <Select 
                value={filters.status} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, status: value as any }))}
              >
                <SelectTrigger className="w-[150px]">
<SelectValue placeholder={t('filters.status')} />
                </SelectTrigger>
                <SelectContent>
<SelectItem value="all">{t('status.all')}</SelectItem>
                  <SelectItem value="investigating">{t('status.investigating')}</SelectItem>
                  <SelectItem value="identified">{t('status.identified')}</SelectItem>
                  <SelectItem value="monitoring">{t('status.monitoring')}</SelectItem>
                  <SelectItem value="resolved">{t('status.resolved')}</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.priority}
                onValueChange={(value) => setFilters(prev => ({ ...prev, priority: value as any }))}
              >
                <SelectTrigger className="w-[150px]">
<SelectValue placeholder={t('filters.priority')} />
                </SelectTrigger>
                <SelectContent>
<SelectItem value="all">{t('priority.all')}</SelectItem>
                  <SelectItem value="P1">{t('priority.p1')}</SelectItem>
                  <SelectItem value="P2">{t('priority.p2')}</SelectItem>
                  <SelectItem value="P3">{t('priority.p3')}</SelectItem>
                  <SelectItem value="P4">{t('priority.p4')}</SelectItem>
                </SelectContent>
              </Select>

              <Select 
                value={filters.severity} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, severity: value as any }))}
              >
                <SelectTrigger className="w-[150px]">
<SelectValue placeholder={t('filters.severity')} />
                </SelectTrigger>
                <SelectContent>
<SelectItem value="all">{t('severity.all')}</SelectItem>
                  <SelectItem value="critical">{t('severity.critical')}</SelectItem>
                  <SelectItem value="high">{t('severity.high')}</SelectItem>
                  <SelectItem value="medium">{t('severity.medium')}</SelectItem>
                  <SelectItem value="low">{t('severity.low')}</SelectItem>
                </SelectContent>
              </Select>

              <Select 
                value={filters.affected_service} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, affected_service: value as any }))}
              >
                <SelectTrigger className="w-[180px]">
<SelectValue placeholder={t('filters.affectedService')} />
                </SelectTrigger>
                <SelectContent>
<SelectItem value="all">{t('services.all')}</SelectItem>
                  <SelectItem value="id-recognition">{t('services.idRecognition')}</SelectItem>
                  <SelectItem value="face-liveness">{t('services.faceLiveness')}</SelectItem>
                  <SelectItem value="id-liveness">{t('services.idLiveness')}</SelectItem>
                  <SelectItem value="face-compare">{t('services.faceCompare')}</SelectItem>
                  <SelectItem value="curp-verifier">{t('services.curpVerifier')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 활성 필터 표시 */}
            {(searchTerm || 
              filters.status !== 'all' || 
              filters.priority !== 'all' || 
              filters.severity !== 'all' || 
              filters.affected_service !== 'all') && (
              <div className="flex items-center gap-2 pt-2 border-t">
<span className="text-sm text-muted-foreground">{t('activeFilters')}:</span>
                {searchTerm && (
                  <Badge variant="secondary" className="flex items-center gap-1">
{tCommon('search')}: "{searchTerm}"
                    <button 
                      onClick={() => setSearchTerm('')}
                      className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
                    >
                      ×
                    </button>
                  </Badge>
                )}
                {filters.status !== 'all' && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    상태: {filters.status}
                    <button 
                      onClick={() => setFilters(prev => ({ ...prev, status: 'all' }))}
                      className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
                    >
                      ×
                    </button>
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 검색 결과 정보 */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            {incidentsLoading ? (
tCommon('loading')
            ) : (
t('incidentCount', { filtered: filteredIncidents.length, total: allIncidents.length })
            )}
          </p>
        </div>

        {/* Incident 목록 */}
        <IncidentList
          incidents={filteredIncidents}
          loading={incidentsLoading}
          error={incidentsError}
        />

      </div>
      
      <Footer />
    </div>
  );
}