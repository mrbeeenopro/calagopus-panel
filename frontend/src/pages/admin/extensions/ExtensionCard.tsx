import { faPuzzlePiece, faTrash, faWrench } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ActionIcon, Group, Title } from '@mantine/core';
import { Link } from 'react-router';
import { Extension } from 'shared';
import { z } from 'zod';
import Badge from '@/elements/Badge.tsx';
import Button from '@/elements/Button.tsx';
import ConditionalTooltip from '@/elements/ConditionalTooltip.tsx';
import Divider from '@/elements/Divider.tsx';
import TitleCard from '@/elements/TitleCard.tsx';
import Tooltip from '@/elements/Tooltip.tsx';
import { adminBackendExtensionSchema } from '@/lib/schemas/admin/backendExtension.ts';

export default function ExtensionCard({
  extension,
  backendExtension,
  isPending,
  isRemoved,
  onRemove,
}: {
  extension?: Extension;
  backendExtension?: z.infer<typeof adminBackendExtensionSchema>;
  isPending?: boolean;
  isRemoved?: boolean;
  onRemove?: () => void;
}) {
  return (
    <TitleCard
      title={backendExtension?.metadataToml.name || extension?.packageName || 'Unknown Extension'}
      icon={<FontAwesomeIcon icon={faPuzzlePiece} />}
      className='max-w-96'
    >
      <div className='flex flex-col'>
        <div className='flex flex-row flex-wrap gap-2 mb-2'>
          {!extension && (
            <Badge color='red' variant='light'>
              Extension frontend missing
            </Badge>
          )}
          {!backendExtension && (
            <Badge color='red' variant='light'>
              Extension backend missing
            </Badge>
          )}
          {isPending && (
            <Badge color='yellow' variant='light'>
              Pending build
            </Badge>
          )}
          {isRemoved && (
            <Badge color='yellow' variant='light'>
              Pending removal
            </Badge>
          )}
        </div>

        {backendExtension && (
          <div className='flex flex-col'>
            <div className='flex flex-row justify-between items-center'>
              <Title order={4} c='white'>
                Package Name
              </Title>
              <span>{backendExtension.metadataToml.packageName}</span>
            </div>
            <div className='flex flex-row justify-between items-center'>
              <Title order={4} c='white'>
                Version
              </Title>
              <span>{backendExtension.version}</span>
            </div>
            <div className='flex flex-row justify-between items-center'>
              <Title order={4} c='white'>
                Authors
              </Title>
              <span>{backendExtension.authors.join(', ') || 'Unknown'}</span>
            </div>
            <p className='mt-2'>{backendExtension.description}</p>
          </div>
        )}

        {extension?.cardComponent ? (
          <>
            <Divider className='my-2' />
            <extension.cardComponent />
            <Divider className='mt-2 mb-4' />
          </>
        ) : (
          <Divider className='mt-2 mb-4' />
        )}

        <Group>
          <ConditionalTooltip
            enabled={!backendExtension || !extension?.cardConfigurationPage}
            label={
              !backendExtension
                ? 'Backend extension is required to configure this extension.'
                : 'This extension does not have a configuration page defined.'
            }
            className='flex-1'
          >
            <Link to={`/admin/extensions/${extension?.packageName}`} className='w-full block'>
              <Button
                leftSection={<FontAwesomeIcon icon={faWrench} />}
                disabled={!backendExtension || !extension?.cardConfigurationPage}
                className='w-full!'
              >
                Configure
              </Button>
            </Link>
          </ConditionalTooltip>
          {backendExtension && onRemove && (
            <Tooltip label='Remove Extension'>
              <ActionIcon color='red' size='input-sm' disabled={isRemoved} onClick={onRemove}>
                <FontAwesomeIcon icon={faTrash} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </div>
    </TitleCard>
  );
}
