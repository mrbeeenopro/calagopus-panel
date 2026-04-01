import { Tooltip as MantineTooltip, TooltipProps } from '@mantine/core';
import classNames from 'classnames';
import { forwardRef } from 'react';

const Tooltip = forwardRef<HTMLDivElement, TooltipProps & { innerClassName?: string }>(
  ({ children, className, innerClassName, ...rest }, ref) => {
    return (
      <MantineTooltip ref={ref} className={classNames(className, 'w-fit leading-none')} {...rest}>
        <div className={innerClassName}>{children}</div>
      </MantineTooltip>
    );
  },
);

export default Tooltip;
