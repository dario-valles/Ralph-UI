import { describe, it, expect } from 'vitest'
import { configApi, recoveryApi, traceApi } from '../api/config-api'
import { templateApi } from '../api/template-api'

// Note: These tests verify the API structure and exports.
// Actual server command integration is tested via E2E tests.

describe('config-api', () => {
  describe('configApi', () => {
    it('exports get function', () => {
      expect(typeof configApi.get).toBe('function')
    })

    it('exports setProjectPath function', () => {
      expect(typeof configApi.setProjectPath).toBe('function')
    })

    it('exports getPaths function', () => {
      expect(typeof configApi.getPaths).toBe('function')
    })

    it('exports updateExecution function', () => {
      expect(typeof configApi.updateExecution).toBe('function')
    })

    it('exports updateGit function', () => {
      expect(typeof configApi.updateGit).toBe('function')
    })

    it('exports updateValidation function', () => {
      expect(typeof configApi.updateValidation).toBe('function')
    })

    it('exports updateFallback function', () => {
      expect(typeof configApi.updateFallback).toBe('function')
    })

    it('exports reload function', () => {
      expect(typeof configApi.reload).toBe('function')
    })

    it('exports save function', () => {
      expect(typeof configApi.save).toBe('function')
    })
  })

  describe('templateApi', () => {
    it('exports list function', () => {
      expect(typeof templateApi.list).toBe('function')
    })

    it('exports listBuiltin function', () => {
      expect(typeof templateApi.listBuiltin).toBe('function')
    })

    it('exports render function', () => {
      expect(typeof templateApi.render).toBe('function')
    })

    it('exports renderTaskPrompt function', () => {
      expect(typeof templateApi.renderTaskPrompt).toBe('function')
    })

    it('exports getContent function', () => {
      expect(typeof templateApi.getContent).toBe('function')
    })
  })

  describe('recoveryApi', () => {
    it('exports checkStaleSessions function', () => {
      expect(typeof recoveryApi.checkStaleSessions).toBe('function')
    })

    it('exports recoverSession function', () => {
      expect(typeof recoveryApi.recoverSession).toBe('function')
    })

    it('exports recoverAll function', () => {
      expect(typeof recoveryApi.recoverAll).toBe('function')
    })

    it('exports acquireLock function', () => {
      expect(typeof recoveryApi.acquireLock).toBe('function')
    })

    it('exports releaseLock function', () => {
      expect(typeof recoveryApi.releaseLock).toBe('function')
    })

    it('exports getLockInfo function', () => {
      expect(typeof recoveryApi.getLockInfo).toBe('function')
    })

    it('exports refreshLock function', () => {
      expect(typeof recoveryApi.refreshLock).toBe('function')
    })
  })

  describe('traceApi', () => {
    it('exports init function', () => {
      expect(typeof traceApi.init).toBe('function')
    })

    it('exports parseOutput function', () => {
      expect(typeof traceApi.parseOutput).toBe('function')
    })

    it('exports getTree function', () => {
      expect(typeof traceApi.getTree).toBe('function')
    })

    it('exports getSummary function', () => {
      expect(typeof traceApi.getSummary).toBe('function')
    })

    it('exports getSubagentEvents function', () => {
      expect(typeof traceApi.getSubagentEvents).toBe('function')
    })

    it('exports clear function', () => {
      expect(typeof traceApi.clear).toBe('function')
    })

    it('exports isSubagentActive function', () => {
      expect(typeof traceApi.isSubagentActive).toBe('function')
    })
  })
})
