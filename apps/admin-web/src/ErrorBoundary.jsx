import React from 'react';

/**
 * 页面级错误边界。
 *
 * 背景：2026-11-18 财务页有一处 `aging.receivable.total` 在接口返回形状变化时抛 TypeError，
 * React 会把整棵树卸载，结果是「点开一个页面，整个系统白屏」——菜单、标签页全没了，
 * 用户只能刷新。这类事故不该由一个页面的一行取值引发。
 *
 * 这里把每个工作区面板各自包一层：出错的页面显示可重试的提示卡，
 * 顶栏、侧栏、其他已打开的标签页全部照常可用。
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // 保留到控制台，方便按组件栈定位；不往外抛，避免再触发上层边界
    console.error(`页面「${this.props.title || '未知'}」渲染失败：`, error, info?.componentStack);
  }

  reset() {
    this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="card" style={{ margin: 16 }}>
        <h3 style={{ marginTop: 0 }}>{this.props.title ? `「${this.props.title}」加载出错` : '这个页面加载出错'}</h3>
        <p className="hint">其他菜单和标签页不受影响，可以切到别的页面，或点下面按钮重试。</p>
        <p className="error-text" role="alert" style={{ wordBreak: 'break-word' }}>{String(error?.message || error)}</p>
        <button className="btn primary" type="button" onClick={this.reset}>重新加载本页</button>
      </div>
    );
  }
}
