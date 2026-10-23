import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { validateEditCode } from '../src/api/validActions';

type Role = 'admin' | 'gallery' | 'none';
interface CodeConfig {
    editCode: string;
}
interface GeneralConfig {
    // 是否简易模式
    // isSimpleMode: boolean;
}
interface Config {
    codeConfig: CodeConfig;
    generalConfig: GeneralConfig;
}
interface SettingStore {
    config: Config;
    // 重置通用配置
    resetGeneralConfig: () => void;
    resetCodeConfig: () => void;
    resetAllConfig: () => void;
    setConfig: (callback: (config: Config) => void) => void;
    setEditCodePermission: (editCode: string) => Promise<Role>;
    role: Role;
    checkAuth: () => Promise<Role>;
    logout: () => Promise<void>;
}

const defaultConfig: Config = {
    codeConfig: {
        editCode: '',
    },
    generalConfig: {
        // isSimpleMode: false,
    }
};

const useConfigStore = create<SettingStore>()(
    devtools(
        persist(immer<SettingStore>(
            (set, get) => ({
                config: defaultConfig,
                role: 'none',
                resetCodeConfig: () => {
                    set((state) => {
                        state.config.codeConfig = { ...defaultConfig.codeConfig }
                    })
                },
                resetAllConfig: () => {
                    set((state) => {
                        state.config = { ...defaultConfig }
                    })
                },
                resetGeneralConfig: () => {
                    set((state) => {
                        state.config.generalConfig = { ...defaultConfig.generalConfig }
                    })
                },
                setConfig: (callback) => {
                    set(state => {
                        callback(state.config)
                    })
                },
                setEditCodePermission: async (code) => {
                    const role = await validateEditCode(code)
                    if (role !== 'none') {
                        set((state) => {
                            state.config.codeConfig.editCode = code
                            state.role = role
                        })
                    } else {
                        set((state) => {
                            state.role = 'none'
                            state.config.codeConfig.editCode = ''
                        })
                    }
                    return role
                },
                checkAuth: async () => {
                    try {
                        const response = await fetch('/api/auth/status', { cache: 'no-store' });
                        if (!response.ok) {
                            throw new Error('auth status failed');
                        }
                        const data: { role?: unknown } = await response.json() as { role?: unknown };
                        const role = data?.role === 'admin' || data?.role === 'gallery' ? data.role : 'none';
                        set((state) => {
                            state.role = role;
                            if (role === 'none') {
                                state.config.codeConfig.editCode = '';
                            }
                        })
                        return role;
                    } catch {
                        set((state) => {
                            state.role = 'none';
                            state.config.codeConfig.editCode = '';
                        })
                        return 'none';
                    }
                },
                logout: async () => {
                    set((state) => {
                        state.config.codeConfig.editCode = '';
                        state.role = 'none';
                    })
                    try {
                        await fetch('/api/auth/logout', { method: 'POST' });
                    } catch {
                        // Keep local state logged out even if the server call fails.
                    }
                }
            })),
            {
                name: 'configStore',
                storage: createJSONStorage(() => localStorage),
                partialize: state => {
                    return { config: state.config }
                }
            },
        ),
        {
            name: 'configStore',
        }
    ),
)

export default useConfigStore;
