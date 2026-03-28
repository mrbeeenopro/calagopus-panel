import { faX, IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ActionIcon } from '@mantine/core';
import { FC, ReactNode, startTransition, useCallback, useMemo, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import TitleCard from '@/elements/TitleCard.tsx';
import { CurrentWindowProvider } from '@/providers/CurrentWindowProvider.tsx';
import { WindowContext } from '@/providers/contexts/windowContext.ts';

const MAX_WINDOWS = 32;
const BASE_Z_INDEX = 100;

interface WindowType {
  id: number;
  icon: IconDefinition;
  title: string;
  component: ReactNode;
  zIndex: number;
}

const WindowProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [windows, setWindows] = useState<WindowType[]>([]);
  const windowId = useRef(1);

  const closeWindow = useCallback((id: number) => {
    setWindows((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const closeAllWindows = useCallback(() => {
    setWindows([]);
  }, []);

  const addWindow = useCallback(
    (icon: IconDefinition, title: string, component: ReactNode) => {
      if (windows.length >= MAX_WINDOWS) return -1;

      const id = windowId.current++;

      startTransition(() => {
        setWindows((prev) => [...prev, { id, icon, title, component, zIndex: BASE_Z_INDEX + prev.length }]);
      });

      return id;
    },
    [windows.length],
  );

  const updateWindow = useCallback((id: number, title: string) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, title } : w)));
  }, []);

  const bringToFront = useCallback((id: number) => {
    startTransition(() => {
      setWindows((prev) => {
        const target = prev.find((w) => w.id === id);
        if (!target) return prev;

        const isOnTop = prev.every((w) => w.id === id || w.zIndex < target.zIndex);
        if (isOnTop) return prev;

        const others = prev.filter((w) => w.id !== id).sort((a, b) => a.zIndex - b.zIndex);

        const reindexed = new Map<number, number>();
        others.forEach((w, i) => reindexed.set(w.id, BASE_Z_INDEX + i));
        reindexed.set(id, BASE_Z_INDEX + others.length);

        return prev.map((w) => ({ ...w, zIndex: reindexed.get(w.id)! }));
      });
    });
  }, []);

  const contextValue = useMemo(
    () => ({
      addWindow,
      updateWindow,
      closeWindow,
      closeAllWindows,
    }),
    [addWindow, updateWindow, closeWindow, closeAllWindows],
  );

  return (
    <WindowContext.Provider value={contextValue}>
      {children}
      {windows.map((w) => (
        <Rnd
          key={`window_${w.id}`}
          default={{
            x: window.innerWidth / 4,
            y: window.innerHeight / 4,
            width: window.innerWidth / 2,
            height: window.innerHeight / 2,
          }}
          minWidth={window.innerWidth / 4}
          minHeight={window.innerHeight / 8}
          bounds='body'
          dragHandleClassName={`window_${w.id}_drag`}
          style={{ zIndex: w.zIndex }}
          onMouseDown={() => bringToFront(w.id)}
          enableResizing={{
            left: true,
            right: true,
            top: true,
            bottom: true,
            bottomLeft: true,
            bottomRight: true,
            topLeft: true,
            topRight: true,
          }}
        >
          <TitleCard
            key={`window_${w.id}_card`}
            className={`h-full window_${w.id}_card`}
            titleClassName={`window_${w.id}_drag cursor-grab select-none`}
            wrapperClassName='h-full pb-16'
            icon={<FontAwesomeIcon icon={w.icon} />}
            title={w.title}
            rightSection={
              <ActionIcon
                variant='subtle'
                className='ml-auto self-end'
                onClick={(e) => {
                  e.stopPropagation();
                  closeWindow(w.id);
                }}
              >
                <FontAwesomeIcon icon={faX} />
              </ActionIcon>
            }
          >
            <CurrentWindowProvider id={w.id}>{w.component}</CurrentWindowProvider>
          </TitleCard>
        </Rnd>
      ))}
    </WindowContext.Provider>
  );
};

export { useWindows } from './contexts/windowContext.ts';
export { WindowProvider };
