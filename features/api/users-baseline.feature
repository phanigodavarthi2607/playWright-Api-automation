@baseline @users
Feature: Users API - baseline (snapshot) comparison
  As a QA engineer
  I want to detect any unexpected change in the Users API response shape
  So that contract regressions are caught before release

  Background:
    Given I am authenticated

  Scenario: GET /v1/users matches the stored baseline
    When I send a GET request to "/v1/users" with query:
      | page     | 1  |
      | pageSize | 10 |
    Then the response status should be 200
    And the response body should match the baseline "users-list-page1" ignoring:
      | meta.requestId     |
      | meta.timestamp     |
      | data[].lastLoginAt |

  @smoke
  Scenario: GET /v1/users/1 returns the expected user
    When I send a GET request to "/v1/users/1"
    Then the response status should be 200
    And the response field "id" should equal "1"
    And the response field "email" should exist
