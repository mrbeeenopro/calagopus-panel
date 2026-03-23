import { faFileText, faRefresh, faUpload } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Group, Title } from '@mantine/core';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import getAdminExtensions from '@/api/admin/extensions/getAdminExtensions.ts';
import addExtension from '@/api/admin/extensions/manage/addExtension.ts';
import getExtensionStatus, { ExtensionStatus } from '@/api/admin/extensions/manage/getExtensionStatus.ts';
import rebuildExtensions from '@/api/admin/extensions/manage/rebuildExtensions.ts';
import removeExtension from '@/api/admin/extensions/manage/removeExtension.ts';
import { httpErrorToHuman } from '@/api/axios.ts';
import Button from '@/elements/Button.tsx';
import { AdminCan } from '@/elements/Can.tsx';
import ConditionalTooltip from '@/elements/ConditionalTooltip.tsx';
import AdminContentContainer from '@/elements/containers/AdminContentContainer.tsx';
import Spinner from '@/elements/Spinner.tsx';
import { adminBackendExtensionSchema } from '@/lib/schemas/admin/backendExtension.ts';
import { useImportDragAndDrop } from '@/plugins/useImportDragAndDrop.ts';
import { useToast } from '@/providers/ToastProvider.tsx';
import ExtensionAddOverlay from './ExtensionAddOverlay.tsx';
import ExtensionCard from './ExtensionCard.tsx';
import BuildLogsModal from './modals/BuildLogsModal.tsx';

export default function AdminExtensions() {
  const { addToast } = useToast();

  const [backendExtensions, setBackendExtensions] = useState<z.infer<typeof adminBackendExtensionSchema>[] | null>(
    null,
  );
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus | null>(null);
  const [openModal, setOpenModal] = useState<'logs' | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const createStatusInterval = () => {
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);

    statusIntervalRef.current = setInterval(() => {
      getExtensionStatus()
        .then((status) => {
          setExtensionStatus(status);
          if (!status.isBuilding && statusIntervalRef.current) {
            clearInterval(statusIntervalRef.current);
            statusIntervalRef.current = null;
            getAdminExtensions()
              .then((extensions) => {
                setBackendExtensions(extensions);
                addToast('Extension build completed. You may need to refresh the page.', 'success');
                setOpenModal(null);
              })
              .catch((err) => {
                addToast(httpErrorToHuman(err), 'error');
              });
          }
        })
        .catch((err) => {
          addToast(httpErrorToHuman(err), 'error');
        });
    }, 5000);
  };

  useEffect(() => {
    getAdminExtensions()
      .then((extensions) => {
        setBackendExtensions(extensions);
      })
      .catch((err) => {
        addToast(httpErrorToHuman(err), 'error');
      });

    getExtensionStatus().then((status) => {
      setExtensionStatus(status);

      if (status.isBuilding) {
        createStatusInterval();
      }
    });

    return () => {
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, []);

  const handleRebuild = () => {
    rebuildExtensions()
      .then(() => {
        addToast('Extension rebuild started successfully.', 'success');
        setExtensionStatus((prev) => prev && { ...prev, isBuilding: true });

        createStatusInterval();
        setOpenModal('logs');
      })
      .catch((err) => {
        addToast(httpErrorToHuman(err), 'error');
      });
  };

  const handleRemove = (backendExtension: z.infer<typeof adminBackendExtensionSchema>) => {
    removeExtension(backendExtension.metadataToml.packageName)
      .then(() => {
        setExtensionStatus((prev) =>
          prev
            ? {
                ...prev,
                pendingExtensions: prev.pendingExtensions.filter(
                  (e) => e.metadataToml.packageName !== backendExtension.metadataToml.packageName,
                ),
                removedExtensions: [
                  ...prev.removedExtensions.filter(
                    (e) => e.metadataToml.packageName !== backendExtension.metadataToml.packageName,
                  ),
                  backendExtension,
                ],
              }
            : prev,
        );
        addToast(`Extension \`${backendExtension.metadataToml.packageName}\` removed successfully.`.md(), 'success');
      })
      .catch((msg) => {
        addToast(httpErrorToHuman(msg), 'error');
      });
  };

  const handleAdd = async (file: File) => {
    addExtension(file)
      .then((extension) => {
        setExtensionStatus((prev) => {
          if (!prev) return prev;

          const appliedMatch = backendExtensions?.find(
            (e) => e.metadataToml.packageName === extension.metadataToml.packageName && e.version === extension.version,
          );

          return {
            ...prev,
            pendingExtensions: appliedMatch
              ? prev.pendingExtensions.filter((e) => e.metadataToml.packageName !== extension.metadataToml.packageName)
              : [
                  ...prev.pendingExtensions.filter(
                    (e) => e.metadataToml.packageName !== extension.metadataToml.packageName,
                  ),
                  extension,
                ],
            removedExtensions: prev.removedExtensions.filter(
              (e) => e.metadataToml.packageName !== extension.metadataToml.packageName,
            ),
          };
        });
        addToast(`Extension \`${extension.metadataToml.packageName}\` added successfully.`.md(), 'success');
      })
      .catch((msg) => {
        addToast(httpErrorToHuman(msg), 'error');
      });
  };

  const { isDragging } = useImportDragAndDrop({
    onDrop: (files) => Promise.all(files.map(handleAdd)),
    enabled: extensionStatus ? !extensionStatus.isBuilding : false,
    filterFile: (file) => file.name.toLowerCase().endsWith('.zip'),
  });

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    event.target.value = '';

    handleAdd(file);
  };

  return (
    <AdminContentContainer
      title='Extensions'
      contentRight={
        <AdminCan action='extensions.manage'>
          <Group hidden={!extensionStatus}>
            <Button
              variant='outline'
              leftSection={<FontAwesomeIcon icon={faFileText} />}
              onClick={() => setOpenModal('logs')}
            >
              View Build Logs
            </Button>
            <ConditionalTooltip
              enabled={extensionStatus?.isBuilding || false}
              label='The panel is currently building extension code. Please wait.'
            >
              <Button
                color='blue'
                leftSection={<FontAwesomeIcon icon={faUpload} />}
                onClick={() => fileInputRef.current?.click()}
                disabled={extensionStatus?.isBuilding}
              >
                Install
              </Button>
            </ConditionalTooltip>

            <input type='file' accept='.zip' ref={fileInputRef} className='hidden' onChange={handleFileUpload} />
          </Group>
        </AdminCan>
      }
    >
      <BuildLogsModal opened={openModal === 'logs'} onClose={() => setOpenModal(null)} />
      <ExtensionAddOverlay visible={isDragging} />

      {!backendExtensions ? (
        <Spinner.Centered />
      ) : !backendExtensions.length && !window.extensionContext.extensions.length ? (
        <span>No extensions installed.</span>
      ) : (
        <div className='flex flex-row flex-wrap gap-4'>
          {window.extensionContext.extensions.map(
            (
              extension,
              _,
              __,
              backendExtension = backendExtensions.find((e) => e.metadataToml.packageName === extension.packageName),
            ) => (
              <ExtensionCard
                key={extension.packageName}
                extension={extension}
                backendExtension={backendExtension}
                isRemoved={extensionStatus?.removedExtensions.some(
                  (e) => e.metadataToml.packageName === extension.packageName,
                )}
                onRemove={extensionStatus && backendExtension ? () => handleRemove(backendExtension) : undefined}
              />
            ),
          )}
          {backendExtensions
            .filter(
              (be) => !window.extensionContext.extensions.find((e) => e.packageName === be.metadataToml.packageName),
            )
            .map((backendExtension) => (
              <ExtensionCard
                key={backendExtension.metadataToml.packageName}
                backendExtension={backendExtension}
                isRemoved={extensionStatus?.removedExtensions.some(
                  (e) => e.metadataToml.packageName === backendExtension.metadataToml.packageName,
                )}
                onRemove={extensionStatus ? () => handleRemove(backendExtension) : undefined}
              />
            ))}
        </div>
      )}

      {extensionStatus && (
        <>
          <Group justify='space-between' align='center' mt='xl'>
            <Title order={2} mt='xl' mb='sm'>
              Pending Extensions
            </Title>

            <AdminCan action='extensions.manage'>
              <ConditionalTooltip
                enabled={
                  (!extensionStatus.pendingExtensions.length && !extensionStatus.removedExtensions.length) ||
                  extensionStatus.isBuilding
                }
                label={
                  extensionStatus.isBuilding
                    ? 'The panel is currently building extension code. Please wait.'
                    : 'No pending extensions to build.'
                }
              >
                <Button
                  color='red'
                  leftSection={<FontAwesomeIcon icon={faRefresh} />}
                  disabled={!extensionStatus.pendingExtensions.length && !extensionStatus.removedExtensions.length}
                  loading={extensionStatus.isBuilding}
                  onClick={handleRebuild}
                >
                  Rebuild Extensions
                </Button>
              </ConditionalTooltip>
            </AdminCan>
          </Group>

          {!extensionStatus.pendingExtensions.length ? (
            <span>No pending extensions.</span>
          ) : (
            <div className='flex flex-row flex-wrap gap-4'>
              {extensionStatus.pendingExtensions.map((extension) => (
                <ExtensionCard
                  key={extension.metadataToml.packageName}
                  backendExtension={extension}
                  isPending
                  onRemove={extensionStatus ? () => handleRemove(extension) : undefined}
                />
              ))}
            </div>
          )}
        </>
      )}
    </AdminContentContainer>
  );
}
