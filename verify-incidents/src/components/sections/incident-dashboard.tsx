import React from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  Eye,
  Activity,
  TrendingUp,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface IncidentStats {
  total: number;
  byStatus?: {
    resolved: number;
    investigating: number;
    identified: number;
    monitoring: number;
  };
  byPriority?: {
    P1: number;
    P2: number;
    P3: number;
  };
  activeIncidents?: number;
  active: number;
  resolved: number;
  p1Count: number;
  resolvedPercentage: number;
  recentActivity?: Array<any>;
}

interface IncidentDashboardProps {
  stats: IncidentStats;
  loading?: boolean;
}

const IncidentDashboard: React.FC<IncidentDashboardProps> = ({ stats, loading = false }) => {
  const t = useTranslations('incidents.dashboard');
  const tStatus = useTranslations('incidents.status');
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 bg-muted rounded w-20"></div>
              <div className="h-4 w-4 bg-muted rounded"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-16 mb-2"></div>
              <div className="h-3 bg-muted rounded w-24"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* 총 장애 이벤트 수 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
<CardTitle className="text-sm font-medium">{t('totalIncidents')}</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.total}</div>
          <p className="text-xs text-muted-foreground">
            활성: {stats.active || stats.activeIncidents || 0}개
          </p>
        </CardContent>
      </Card>

      {/* 활성 장애 이벤트 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
<CardTitle className="text-sm font-medium">{t('activeIncidents')}</CardTitle>
          <AlertTriangle className="h-4 w-4 text-orange-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-orange-600">{stats.active || stats.activeIncidents || 0}</div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span className="text-xs text-muted-foreground">P1: {stats.p1Count || stats.byPriority?.P1 || 0}</span>
            </div>
            {stats.byPriority && (
              <>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                  <span className="text-xs text-muted-foreground">P2: {stats.byPriority.P2}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span className="text-xs text-muted-foreground">P3: {stats.byPriority.P3}</span>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 해결률 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
<CardTitle className="text-sm font-medium">{t('resolvedPercentage')}</CardTitle>
          <CheckCircle className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">{stats.resolvedPercentage}%</div>
          <Progress 
            value={stats.resolvedPercentage} 
            className="mt-2"
          />
          <p className="text-xs text-muted-foreground mt-1">
{stats.resolved || stats.byStatus?.resolved || 0}/{stats.total} {tStatus('resolved')}
          </p>
        </CardContent>
      </Card>

      {/* 상태별 분포 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
<CardTitle className="text-sm font-medium">{t('statusDistribution')}</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge 
                  variant="secondary" 
                  className="w-3 h-3 p-0 bg-orange-100 border-orange-300"
                />
<span className="text-xs">{tStatus('investigating')}</span>
              </div>
              <span className="text-xs font-medium">{stats.byStatus?.investigating || 0}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className="w-3 h-3 p-0 bg-yellow-100 border-yellow-300"
                />
<span className="text-xs">{tStatus('identified')}</span>
              </div>
              <span className="text-xs font-medium">{stats.byStatus?.identified || 0}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className="w-3 h-3 p-0 bg-blue-100 border-blue-300"
                />
<span className="text-xs">{tStatus('monitoring')}</span>
              </div>
              <span className="text-xs font-medium">{stats.byStatus?.monitoring || 0}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className="w-3 h-3 p-0 bg-green-100 border-green-300"
                />
<span className="text-xs">{tStatus('resolved')}</span>
              </div>
              <span className="text-xs font-medium">{stats.resolved || stats.byStatus?.resolved || 0}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default IncidentDashboard;