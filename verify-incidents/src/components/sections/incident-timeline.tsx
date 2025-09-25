import React, { useState } from 'react';
import { 
  Clock, 
  User, 
  MessageSquare, 
  Plus, 
  Send,
  CheckCircle,
  AlertCircle,
  Info,
  Eye
} from 'lucide-react';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { IncidentUpdate, IncidentStatus } from '@/lib/types';
import { STATUS_INFO } from '@/lib/types';

interface IncidentTimelineProps {
  incidentId: string;
  updates: IncidentUpdate[];
  currentStatus: IncidentStatus;
  onAddUpdate: (update: { status: IncidentStatus; description: string }) => Promise<void>;
  canEdit?: boolean;
}

const getStatusIcon = (status: IncidentStatus) => {
  switch (status) {
    case 'investigating':
      return <AlertCircle className="w-4 h-4 text-orange-500" />;
    case 'identified':
      return <Eye className="w-4 h-4 text-yellow-600" />;
    case 'monitoring':
      return <Clock className="w-4 h-4 text-blue-500" />;
    case 'resolved':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    default:
      return <Info className="w-4 h-4 text-gray-500" />;
  }
};

const TimelineItem: React.FC<{ update: IncidentUpdate; isLast: boolean }> = ({ 
  update, 
  isLast 
}) => {
  const statusInfo = STATUS_INFO[update.status];
  
  return (
    <div className="flex gap-4">
      {/* 타임라인 아이콘 */}
      <div className="flex flex-col items-center">
        <div 
          className="flex items-center justify-center w-8 h-8 rounded-full border-2"
          style={{
            backgroundColor: statusInfo.bgColor,
            borderColor: statusInfo.color
          }}
        >
          {getStatusIcon(update.status)}
        </div>
        {!isLast && (
          <div className="w-0.5 h-8 bg-border mt-2"></div>
        )}
      </div>
      
      {/* 업데이트 내용 */}
      <div className="flex-1 pb-8">
        <div className="flex items-center gap-2 mb-2">
          <Badge 
            variant="secondary"
            style={{
              backgroundColor: statusInfo.bgColor,
              color: statusInfo.color
            }}
          >
            {statusInfo.label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatDate(update.created_at)}
          </span>
          <span className="text-xs text-muted-foreground">
            ({formatRelativeTime(update.created_at)})
          </span>
        </div>
        
        <p className="text-sm text-foreground leading-relaxed">
          {update.description}
        </p>
      </div>
    </div>
  );
};

const AddUpdateForm: React.FC<{
  currentStatus: IncidentStatus;
  onSubmit: (update: { status: IncidentStatus; description: string }) => Promise<void>;
}> = ({ currentStatus, onSubmit }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<IncidentStatus>(currentStatus);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!description.trim()) {
      alert('업데이트 내용을 입력하세요.');
      return;
    }
    
    setLoading(true);
    try {
      await onSubmit({ status, description: description.trim() });
      setDescription('');
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to add update:', error);
      alert('업데이트 추가에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <div className="flex justify-center pt-4">
        <Button 
          onClick={() => setIsOpen(true)}
          variant="outline"
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          상태 업데이트 추가
        </Button>
      </div>
    );
  }

  return (
    <Card className="border-dashed">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">새 상태</label>
            <Select value={status} onValueChange={(value) => setStatus(value as IncidentStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_INFO).map(([key, info]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(key as IncidentStatus)}
                      <span>{info.label}</span>
                      <span className="text-xs text-muted-foreground">
                        - {info.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">업데이트 내용</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="상태 변경에 대한 상세한 설명을 입력하세요. 원인 분석, 해결 과정, 다음 단계 등을 포함해주세요."
              rows={4}
              className="text-base"
            />
            <p className="text-xs text-muted-foreground">
              현재: {description.length}자 (최소 10자 권장)
            </p>
          </div>
          
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsOpen(false);
                setDescription('');
              }}
              disabled={loading}
            >
              취소
            </Button>
            <Button 
              type="submit" 
              disabled={loading || !description.trim()}
            >
              {loading ? (
                <>
                  <Clock className="w-4 h-4 mr-2 animate-spin" />
                  추가 중...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  업데이트 추가
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

const IncidentTimeline: React.FC<IncidentTimelineProps> = ({ 
  incidentId,
  updates, 
  currentStatus,
  onAddUpdate,
  canEdit = true 
}) => {
  if (updates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            업데이트 히스토리
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              아직 업데이트가 없습니다
            </h3>
            <p className="text-muted-foreground mb-4">
              첫 번째 상태 업데이트를 추가해보세요
            </p>
            {canEdit && (
              <AddUpdateForm 
                currentStatus={currentStatus}
                onSubmit={onAddUpdate}
              />
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          업데이트 히스토리
          <Badge variant="secondary" className="text-xs">
            {updates.length}개 업데이트
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-0">
          {updates
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map((update, index) => (
              <TimelineItem 
                key={update.id} 
                update={update} 
                isLast={index === updates.length - 1}
              />
            ))}
        </div>
        
        {/* 새 업데이트 추가 폼 */}
        {canEdit && currentStatus !== 'resolved' && (
          <div className="pt-4 border-t">
            <AddUpdateForm 
              currentStatus={currentStatus}
              onSubmit={onAddUpdate}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default IncidentTimeline;