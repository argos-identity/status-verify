import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import {
  Clock,
  AlertTriangle,
  User,
  Server,
  ExternalLink,
  CheckCircle,
  Eye,
  Search,
  Loader2,
  Edit
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  formatDate,
  formatRelativeTime,
  getStatusColor,
  getPriorityColor,
  getSeverityColor,
  calculateResolutionTime,
  formatServiceName
} from '@/lib/utils';
import type { Incident } from '@/lib/types';
import { STATUS_INFO, PRIORITY_INFO, SEVERITY_INFO } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';

interface IncidentListProps {
  incidents: Incident[];
  loading?: boolean;
  error?: string | null;
}

const StatusBadge: React.FC<{ status: Incident['status'] }> = ({ status }) => {
  const info = STATUS_INFO[status];
  return (
    <Badge 
      variant="secondary" 
      className="text-xs"
      style={{
        backgroundColor: info.bgColor,
        color: info.color,
        border: `1px solid ${info.color}20`
      }}
    >
      {info.label}
    </Badge>
  );
};

const PriorityBadge: React.FC<{ priority: Incident['priority'] }> = ({ priority }) => {
  const info = PRIORITY_INFO[priority];
  return (
    <Badge 
      variant="outline" 
      className="text-xs font-medium"
      style={{
        backgroundColor: info.bgColor,
        color: info.color,
        borderColor: info.color
      }}
    >
      {info.label}
    </Badge>
  );
};

const SeverityBadge: React.FC<{ severity: Incident['severity'] }> = ({ severity }) => {
  const info = SEVERITY_INFO[severity];
  return (
    <Badge 
      variant="outline" 
      className="text-xs"
      style={{
        backgroundColor: info.bgColor,
        color: info.color,
        borderColor: info.color
      }}
    >
      {info.label}
    </Badge>
  );
};

const IncidentCard: React.FC<{ incident: Incident }> = ({ incident }) => {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const t = useTranslations('incidents');
  const resolutionTime = calculateResolutionTime(incident.created_at, incident.resolved_at ?? undefined);
  
  return (
    <Card className="hover:shadow-md transition-shadow duration-200 border-l-4" 
          style={{ 
            borderLeftColor: incident.status === 'resolved' 
              ? 'var(--color-status-resolved)' 
              : 'var(--color-primary)' 
          }}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Link 
                href={`/incidents/${incident.id}`}
                className="text-lg font-semibold text-foreground hover:text-primary transition-colors line-clamp-2"
              >
                {incident.title}
              </Link>
              <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </div>
            
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <StatusBadge status={incident.status} />
              <PriorityBadge priority={incident.priority} />
              <SeverityBadge severity={incident.severity} />
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{formatRelativeTime(incident.created_at)}</span>
            </div>
            {resolutionTime && (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle className="w-3 h-3" />
                <span className="text-xs">{resolutionTime}만에 해결</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {incident.description && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
            {incident.description}
          </p>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* 보고자 정보 */}
          {incident.reporter && (
            <div className="flex items-center gap-2">
              <User className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">보고자:</span>
              <span className="font-medium">{incident.reporter}</span>
            </div>
          )}
          
          {/* 영향받는 서비스 */}
          <div className="flex items-start gap-2">
            <Server className="w-3 h-3 text-muted-foreground mt-0.5" />
            <div>
              <span className="text-muted-foreground">영향 서비스:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {incident.affected_services.map((service) => (
                  <Badge 
                    key={service} 
                    variant="outline" 
                    className="text-xs px-2 py-0"
                  >
                    {formatServiceName(service)}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          
          {/* 감지 기준 */}
          {incident.detection_criteria && (
            <div className="flex items-start gap-2 md:col-span-2">
              <Search className="w-3 h-3 text-muted-foreground mt-0.5" />
              <div>
                <span className="text-muted-foreground">감지 기준:</span>
                <span className="ml-1 text-foreground">{incident.detection_criteria}</span>
              </div>
            </div>
          )}
          
          {/* 생성 시간 (상세) */}
          <div className="md:col-span-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                생성: {formatDate(incident.created_at)}
              </span>
              {incident.resolved_at && (
                <span className="text-green-600">
                  해결: {formatDate(incident.resolved_at)}
                </span>
              )}
            </div>
          </div>
        </div>
        
        {/* 액션 버튼들 */}
        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-border">
          {/* 상세보기 버튼: 로그인 여부와 상관없이 항상 표시 */}
          <Link href={`/incidents/${incident.id}`}>
            <Button variant="outline" size="sm" className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
{t('viewDetails')}
            </Button>
          </Link>

          {/* 수정 버튼: 로그인된 사용자에게만 표시 (해결된 사건 제외) */}
          {isAuthenticated && !authLoading && user && incident.status !== 'resolved' && (
            <Link href={`/incidents/${incident.id}/edit`}>
              <Button size="sm" className="flex items-center gap-1">
                <Edit className="w-3 h-3" />
{t('editIncident')}
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const IncidentList: React.FC<IncidentListProps> = ({ incidents, loading = false, error = null }) => {
  const t = useTranslations('incidents');
  const tCommon = useTranslations('common');
  // Loading state
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="flex gap-2 mb-3">
                    <div className="h-5 bg-muted rounded w-16"></div>
                    <div className="h-5 bg-muted rounded w-12"></div>
                    <div className="h-5 bg-muted rounded w-14"></div>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-3 bg-muted rounded w-full mb-2"></div>
              <div className="h-3 bg-muted rounded w-2/3 mb-4"></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="h-3 bg-muted rounded"></div>
                <div className="h-3 bg-muted rounded"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    const isPermissionError = error.includes('Permission denied') || error.includes('Required permission');

    return (
      <Alert variant={isPermissionError ? "default" : "destructive"}>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {error}
          {isPermissionError && (
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
    );
  }

  // Empty state
  if (incidents.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">
{t('noIncidentsFound')}
        </h3>
        <p className="text-muted-foreground mb-4">
{t('tryDifferentFilters')}
        </p>
        {/* TODO: 향후 활성화를 위해 임시 비활성화
        <Link href="/incidents/create">
          <Button className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            New Failure Event 생성
          </Button>
        </Link>
        */}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {incidents.map((incident) => (
        <IncidentCard key={incident.id} incident={incident} />
      ))}

      {/* 페이지네이션 (향후 구현) */}
      {incidents.length > 10 && (
        <div className="flex items-center justify-center pt-8">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">이전</Button>
            <span className="text-sm text-muted-foreground px-4">
              1 / 1 페이지
            </span>
            <Button variant="outline" size="sm">다음</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncidentList;