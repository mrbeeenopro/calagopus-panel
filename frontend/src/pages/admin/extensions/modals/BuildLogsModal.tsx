import { ModalProps, Stack } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import getExtensionBuildLogs from '@/api/admin/extensions/manage/getExtensionBuildLogs.ts';
import { httpErrorToHuman } from '@/api/axios.ts';
import Button from '@/elements/Button.tsx';
import Code from '@/elements/Code.tsx';
import { Modal, ModalFooter } from '@/elements/modals/Modal.tsx';
import { useToast } from '@/providers/ToastProvider.tsx';

export default function BuildLogsModal({ opened, onClose }: ModalProps) {
  const { addToast } = useToast();

  const [logs, setLogs] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  useEffect(() => {
    if (!opened) return;

    const fetchLogs = () => {
      getExtensionBuildLogs()
        .then((data) => setLogs(data))
        .catch((msg) => {
          addToast(httpErrorToHuman(msg), 'error');
        });
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);

    return () => clearInterval(interval);
  }, [opened]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;

    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
  };

  return (
    <Modal title='Build Logs' onClose={onClose} opened={opened} size='lg'>
      <Stack>
        <div ref={scrollRef} onScroll={handleScroll} className='overflow-y-auto max-h-96'>
          <Code block>{logs || 'No logs found.'}</Code>
        </div>

        <ModalFooter>
          <Button variant='default' onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </Stack>
    </Modal>
  );
}
