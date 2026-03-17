'use no memo';

import classNames from 'classnames';
import { memo, useEffect, useRef, useState } from 'react';
import { formatDateTime, formatMiliseconds } from '@/lib/time.ts';
import { useTranslations } from '@/providers/TranslationProvider.tsx';
import Tooltip from '../Tooltip.tsx';

interface EstimatedTimeArrivalProps {
  progress: number;
  total: number;
  className?: string;
  autoUpdate?: boolean;
}

function EstimatedTimeArrival({ progress, total, className, autoUpdate = true }: EstimatedTimeArrivalProps) {
  const { t } = useTranslations();
  const [, forceRender] = useState(0);
  const progressRef = useRef(progress);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const historyRef = useRef<{ t: number; p: number }[]>([]);
  const hasStartedProgress = useRef(false);

  useEffect(() => {
    if (!autoUpdate || progress >= total) return;

    if (historyRef.current.length === 0) {
      historyRef.current.push({ t: Date.now(), p: progressRef.current });
    }

    const intervalId = setInterval(() => {
      const now = Date.now();
      const currentProgress = progressRef.current;

      historyRef.current.push({ t: now, p: currentProgress });

      historyRef.current = historyRef.current.filter((entry) => now - entry.t <= 30_000);

      forceRender((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [autoUpdate, total, progress]);

  const history = historyRef.current;
  let remainingMs = Infinity;
  let targetDate: number | null = null;

  if (history.length > 1 && progress < total) {
    const oldest = history[0];
    const newest = history[history.length - 1];

    const deltaProgress = newest.p - oldest.p;
    const deltaTime = newest.t - oldest.t;

    if (deltaProgress > 0) {
      hasStartedProgress.current = true;
    }

    if (deltaProgress > 0 && deltaTime > 0) {
      const msPerUnit = deltaTime / deltaProgress;
      remainingMs = msPerUnit * (total - newest.p);
      targetDate = Date.now() + remainingMs;
    }
  } else if (progress >= total) {
    remainingMs = 0;
    targetDate = Date.now();
  }

  const displayDuration =
    hasStartedProgress.current && isFinite(remainingMs)
      ? t('elements.estimatedTimeArrival.calculated', { time: formatMiliseconds(remainingMs) })
      : t('elements.estimatedTimeArrival.calculating', {});

  let tooltipLabel = t('elements.estimatedTimeArrival.tooltip.estimating', {});
  if (targetDate && hasStartedProgress.current && isFinite(remainingMs)) {
    tooltipLabel = t('elements.estimatedTimeArrival.tooltip.estimated', {
      time: formatDateTime(targetDate),
    });
  }

  return (
    <Tooltip label={tooltipLabel}>
      <span className={classNames('cursor-help', className)}>{displayDuration}</span>
    </Tooltip>
  );
}

export default memo(EstimatedTimeArrival);
