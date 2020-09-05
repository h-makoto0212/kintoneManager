/**
 * user, passが指定されれば、パスワード認証
 * 指定されなければ、APIトークン認証
 * Basic認証を使用している場合はオプションを有効にする
 * appsは以下の形式
 * {
 *    // アプリケーション名はkintoneのデータに依存せず、GAS内のコードで取り扱う専用
 *    YOUR_APP_NAME1: {
 *      appid: 1,
 *      guestid: 2,
 *      name: "日報",
 *      token: "XXXXXXXXXXXXXX_YOUR_TOKEN_XXXXXXXXXXXXXX" // 省略可。APIトークン認証時に使用
 *    },
 *    YOUR_APP_NAME2: {
 *       ...
 *    }
 * }
 * basicは以下の形式(ドメイン共通で指定されている認証情報を入力)
 * {
 *   user: "example",
 *   pass: "xxxxx"
 * }
 */

/**
 * Initialize
 * @param {string} subdomain your subdomain (For kintone.com domains,
 *   you must state the FQDN such as "subdomain.kintone.com" )
 * @param {object} apps list of Applications
 * @param {object} apps.app application information
 * @param {number} apps.app.appid application ID
 * @param {string} apps.app.name application name
 * @param {number} [apps.app.guestid] Guest id if you are a guest account.
 * @param {string} [apps.app.token] accessible API tokens ex) "API_TOKEN1,API_TOKEN2"
 * @param {string} [user] user name or encoded authentication information: base64("USER:PASS")
 * @param {string} [pass] password
 * @param {object} [basic] user and pass required for basic authentication
 * @param {string} [basic.user] authentication fragment
 * @param {string} [basic.pass] authentication fragment
 * @constructor
 */
class KintoneManager {
  constructor(subdomain, apps, user, pass, basic) {
    this.subdomain = subdomain;
    this.authorization = null;
    this.apps = apps;
    this.basic =
      !!basic && Utilities.base64Encode(`${basic.user}:${basic.pass}`);

    if (arguments.length > 3) {
      this.authorization = Utilities.base64Encode(`${user}:${pass}`);
    } else if (arguments.length > 2) {
      // 引数が3つの場合はエンコード済みの認証情報として処理
      this.authorization = user;
    }
  }

  /**
   * Records registration
   * @param {string} app_name Application name
   * @param {Array} records Kintone record objects ref) https://developer.cybozu.io/hc/ja/articles/201941784
   * @returns {HTTPResponse} ref) https://developers.google.com/apps-script/reference/url-fetch/http-response
   */
  create(app_name, records) {
    const app = this.apps[app_name];
    const payload = {
      app: app.appid,
      records
    };
    const response = UrlFetchApp.fetch(
      "@1/records.json".replace(/@1/g, this._getEndpoint(app.guestid)),
      this._postOption(app, payload)
    );
    return response;
  }

  /**
   * Search records
   * @param {string} app_name Application name
   * @param {string} query kintone API query ref) https://developer.cybozu.io/hc/ja/articles/202331474-%E3%83%AC%E3%82%B3%E3%83%BC%E3%83%89%E3%81%AE%E5%8F%96%E5%BE%97-GET-#step2
   * @returns {Array} search results
   */
  search(app_name, query) {
    const q = encodeURIComponent(query);
    const app = this.apps[app_name];
    const response = UrlFetchApp.fetch(
      "@1/records.json?app=@2&query=@3"
        .replace(/@1/g, this._getEndpoint(app.guestid))
        .replace(/@2/g, app.appid)
        .replace(/@3/g, q),
      this._getOption(app)
    );
    return response;
  }

  /**
   * Updates records
   * @param {string} app_name Application name
   * @param {Array} records Array of records that will be updated.
   * @returns {HTTPResponse} ref) https://developers.google.com/apps-script/reference/url-fetch/http-response
   */
  update(app_name, records) {
    const app = this.apps[app_name];
    const payload = {
      app: app.appid,
      records
    };
    const response = UrlFetchApp.fetch(
      "@1/records.json".replace(/@1/g, this._getEndpoint(app.guestid)),
      this._putOption(app, payload)
    );
    return response;
  }

  /**
   * Deletes Records
   * @param {string} app_name Application name
   * @param {Array} record_ids Array of record IDs that will be deleted.
   * @returns {HTTPResponse} ref) https://developers.google.com/apps-script/reference/url-fetch/http-response
   */
  destroy(app_name, record_ids) {
    const app = this.apps[app_name];
    const query = record_ids.reduce((prev, current, index) => {
      return prev + "&ids[@1]=@2".replace(/@1/g, index).replace(/@2/g, current);
    }, `app=${app.appid}`);

    const response = UrlFetchApp.fetch(
      "@1/records.json?@2"
        .replace(/@1/g, this._getEndpoint(app.guestid))
        .replace(/@2/g, query),
      this._deleteOption(app)
    );
    return response;
  }

  /**
   * Upload File
   * @param {string} app_name Application name
   * @param {string} file_id Upload file of Google Drive fIle ID
   * @returns {HTTPResponse} ref) https://developer.cybozu.io/hc/ja/articles/201941824
   */
  upload(app_name, file_id) {
    const app = this.apps[app_name];
    const file = DriveApp.getFileById(file_id);
    const boundary = "blob";
    // data -> multipart/form-data
    const data = `--${boundary}
Content-Disposition: form-data; name="file"; filename="${file.getName()}"
Content-Type:${file.getMimeType()}\r\n\r\n`;
    const payload = Utilities.newBlob(data)
      .getBytes()
      .concat(file.getBlob().getBytes())
      .concat(Utilities.newBlob(`\r\n--${boundary}--`).getBytes());
    const response = UrlFetchApp.fetch(
      "@1/file.json".replace(/@1/g, this._getEndpoint(app.guestid)),
      this._uploadOption(app, payload, boundary)
    );
    return response;
  }

  /**
   * option for GET Method
   * @param {object} app Application object
   * @returns {object} Option for UrlFetchApp
   * @private
   */
  _getOption(app) {
    const option = {
      method: "get",
      headers: this._authorizationHeader(app),
      muteHttpExceptions: true
    };
    return option;
  }

  /**
   * option for POST Method
   * @param {object} app Application object
   * @param {object} payload Request payload
   * @returns {object} Option for UrlFetchApp
   * @private
   */
  _postOption(app, payload) {
    const option = {
      method: "post",
      contentType: "application/json",
      headers: this._authorizationHeader(app),
      muteHttpExceptions: true,
      payload: JSON.stringify(payload)
    };
    return option;
  }

  /**
   * option for PUT Method
   * @param {object} app Application object
   * @param {object} payload Request payload
   * @returns {object} Option for UrlFetchApp
   * @private
   */
  _putOption(app, payload) {
    const option = {
      method: "put",
      contentType: "application/json",
      headers: this._authorizationHeader(app),
      muteHttpExceptions: true,
      payload: JSON.stringify(payload)
    };
    return option;
  }

  /**
   * option for DELETE Method
   * @param {object} app Application Object
   * @returns {object} option Option for UrlFetchApp
   * @private
   */
  _deleteOption(app) {
    const option = {
      method: "delete",
      headers: this._authorizationHeader(app),
      muteHttpExceptions: true
    };
    return option;
  }
  /**
   * option for UPLOAD Method
   * @param {object} app Application Object
   * @param {object} payload Request payload
   * @param {string} boundary Character string to identify
   * @returns {object} option Option for UrlFetchApp
   * @private
   */
  _uploadOption(app, payload, boundary) {
    const option = {
      method: "post",
      contentType: `multipart/form-data; boundary=${boundary}`,
      headers: this._authorizationHeader(app),
      payload
    };
    return option;
  }

  /**
   * Gets Endpoint
   * @param {string} [guest_id] (optional) Guest id if you are a guest account.
   * @returns {string} Endpoint url
   * @private
   */
  _getEndpoint(guest_id) {
    const endpoint =
      this.subdomain.slice(-4) === ".com"
        ? `https://${this.subdomain}`
        : `https://${this.subdomain}.cybozu.com`;

    if (guest_id == null) {
      return `${endpoint}/k/v1`;
    } else {
      return endpoint + "/k/guest/@1/v1".replace(/@1/g, guest_id);
    }
  }

  /**
   * Header Authentication Information
   * @param {object} app Application object
   * @param {string} app.token (optional)Application's API token
   * @returns {object} Authentication Information
   * @throws {Exception} Authentication is null
   * @private
   */
  _authorizationHeader({ token }) {
    if (!(this.authorization || token)) {
      throw new Error("Authentication Failed");
    }

    const _auth = {};
    if (this.authorization) {
      // Password authentication
      _auth["X-Cybozu-Authorization"] = this.authorization;
    }
    if (this.authorization && this.basic) {
      // Basic authentication
      _auth["Authorization"] = `Basic ${this.basic}`;
    }
    if (token) {
      // API token authentication
      _auth["X-Cybozu-API-Token"] = token;
    }
    return _auth;
  }
}
