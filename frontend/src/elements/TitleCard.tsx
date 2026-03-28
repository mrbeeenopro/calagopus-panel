import { Box, Group, Title } from '@mantine/core';
import classNames from 'classnames';
import type { ReactNode } from 'react';
import Card from './Card.tsx';

export interface TitleCardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  titleClassName?: string;
  wrapperClassName?: string;

  leftSection?: ReactNode;
  rightSection?: ReactNode;
}

export default function TitleCard({
  title,
  icon,
  children,
  className,
  titleClassName,
  wrapperClassName,
  leftSection,
  rightSection,
}: TitleCardProps) {
  return (
    <Card withBorder radius='md' p={0} bg='dark.7' className={className}>
      <Box
        px='md'
        py='sm'
        style={{
          borderBottom: '1px solid var(--mantine-color-dark-5)',
          background: 'var(--mantine-color-dark-6)',
        }}
      >
        <Group gap='sm' className={titleClassName}>
          {leftSection}
          <Box
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              background: 'var(--mantine-color-dark-5)',
            }}
          >
            {icon}
          </Box>
          <Title order={5} c='gray.2' fw={600}>
            {title}
          </Title>
          {rightSection}
        </Group>
      </Box>
      <div className={classNames('p-4', wrapperClassName)}>{children}</div>
    </Card>
  );
}
