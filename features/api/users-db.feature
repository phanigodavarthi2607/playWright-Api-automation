@db @users
Feature: Users API - warehouse comparison
  As a data QA engineer
  I want the API to reflect what's in the warehouse
  So that the UI and downstream consumers see a single source of truth

  Background:
    Given I am authenticated

  @databricks
  Scenario: GET /v1/users matches Databricks
    When I send a GET request to "/v1/users" with query:
      | page     | 1  |
      | pageSize | 50 |
    And I query Databricks:
      """
      SELECT id, email, first_name, last_name, status
      FROM users
      ORDER BY id
      LIMIT 50
      """
    Then the response status should be 200
    And the response field "data" should match the DB rows with mapping:
      | first_name | firstName |
      | last_name  | lastName  |

  @snowflake
  Scenario: GET /v1/users matches Snowflake
    When I send a GET request to "/v1/users" with query:
      | page     | 1  |
      | pageSize | 50 |
    And I query Snowflake:
      """
      SELECT ID, EMAIL, FIRST_NAME, LAST_NAME, STATUS
      FROM USERS
      ORDER BY ID
      LIMIT 50
      """
    Then the response status should be 200
    And the response field "data" should match the DB rows with mapping:
      | first_name | firstName |
      | last_name  | lastName  |
