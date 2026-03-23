import { TooltipProps as MantineTooltipProps, Tooltip } from '@mantine/core';
import classNames from 'classnames';
import { forwardRef } from 'react';

export interface TooltipProps extends MantineTooltipProps {
  enabled: boolean;
  innerClassName?: string;
}

const ConditionalTooltip = forwardRef<HTMLDivElement, TooltipProps>(
  ({ children, className, innerClassName, enabled, ...rest }, ref) => {
    return enabled ? (
      <Tooltip ref={ref} className={className} {...rest}>
        <div className={innerClassName}>{children}</div>
      </Tooltip>
    ) : (
      <div className={classNames(className, innerClassName)}>{children}</div>
    );
  },
);

export default ConditionalTooltip;
