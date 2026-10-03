/**
 * [INPUT]: 依赖 React 错误边界生命周期
 * [OUTPUT]: 对外提供 ErrorBoundary 组件
 * [POS]: 应用错误呈现边界，复用纸墨控件，开发诊断只在开发模式出现
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="blog-shell blog-error">
                    <main className="blog-container">
                        <div className="blog-empty">
                            <h1>页面暂时打不开</h1>
                            <p>刷新页面，重新载入这篇内容。</p>
                            <button onClick={() => window.location.reload()} className="zzm-btn zzm-btn--primary">刷新页面</button>
                            {import.meta.env.DEV && <details className="blog-error-details"><summary>开发诊断</summary><pre>{this.state.error?.toString()}{'\n'}{this.state.errorInfo?.componentStack}</pre></details>}
                        </div>
                    </main>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
