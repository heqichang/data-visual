import React from 'react'
import { Alert, Button } from 'antd'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('组件错误:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert
          type="error"
          showIcon
          message="组件渲染出错"
          description={
            <div>
              <p>{this.state.error?.message || '未知错误'}</p>
              <p style={{ marginTop: 8 }}>
                <Button type="primary" size="small" onClick={this.handleReset}>
                  重试
                </Button>
              </p>
            </div>
          }
        />
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
